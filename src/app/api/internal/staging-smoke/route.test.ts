import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runStagingSmokeBootstrapMock = vi.fn();

vi.mock("@/lib/smoke/runtime", () => ({
  runStagingSmokeBootstrap: runStagingSmokeBootstrapMock
}));

function stagingRequest(input?: { secret?: string; bearer?: boolean; body?: unknown }) {
  const headers = new Headers({ "content-type": "application/json", "x-request-id": "test-request-id" });
  if (input?.secret && input.bearer) headers.set("authorization", `Bearer ${input.secret}`);
  if (input?.secret && !input.bearer) headers.set("x-pgs-staging-smoke-secret", input.secret);

  return new NextRequest("https://pgs.local/api/internal/staging-smoke", {
    method: "POST",
    headers,
    body: JSON.stringify(input?.body ?? {})
  });
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

const safeSmokeResult = {
  ok: true,
  smokeUser: {
    ok: true,
    smokeEmailConfigured: true,
    user: "updated",
    appRole: "VIEWER",
    organizationMembership: "project_manager",
    projectMemberships: [{ projectId: "project-smoke", action: "kept", role: "VIEWER" }],
    revokedSessions: 1,
    secretsPrinted: false
  },
  checks: [{ name: "login", status: "pass", httpStatus: 200 }],
  liveAi: { name: "live AI smoke", status: "skip", requested: false },
  secretsPrinted: false
};

describe("staging smoke runtime endpoint", () => {
  beforeEach(() => {
    runStagingSmokeBootstrapMock.mockReset();
    vi.stubEnv("PORT", "");
    vi.stubEnv("STAGING_SMOKE_BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled outside APP_ENV=staging", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    const { POST } = await import("./route");

    const response = await POST(stagingRequest({ secret: "expected-secret" }));

    expect(response.status).toBe(404);
    expect(await responseJson(response)).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(runStagingSmokeBootstrapMock).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid staging smoke secrets", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SMOKE_SECRET", "");
    const { POST } = await import("./route");

    const missingSecretResponse = await POST(stagingRequest());
    expect(missingSecretResponse.status).toBe(403);
    expect(await responseJson(missingSecretResponse)).toMatchObject({ error: { code: "STAGING_SMOKE_SECRET_MISSING" } });

    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    const invalidSecretResponse = await POST(stagingRequest({ secret: "wrong-secret" }));
    expect(invalidSecretResponse.status).toBe(403);
    expect(await responseJson(invalidSecretResponse)).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(runStagingSmokeBootstrapMock).not.toHaveBeenCalled();
  });

  it("runs the guarded staging path with a valid bearer secret", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    runStagingSmokeBootstrapMock.mockResolvedValue(safeSmokeResult);
    const { POST } = await import("./route");

    const response = await POST(stagingRequest({ secret: "expected-secret", bearer: true, body: { includeLiveAi: true } }));

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual(safeSmokeResult);
    expect(runStagingSmokeBootstrapMock).toHaveBeenCalledWith({
      baseUrl: "https://pgs.local",
      includeLiveAi: true,
      requestId: "test-request-id"
    });
  });

  it("uses a loopback base URL when a runtime PORT is available", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("PORT", "10000");
    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    runStagingSmokeBootstrapMock.mockResolvedValue(safeSmokeResult);
    const { POST } = await import("./route");

    const response = await POST(stagingRequest({ secret: "expected-secret", bearer: true }));

    expect(response.status).toBe(200);
    expect(runStagingSmokeBootstrapMock).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:10000",
      includeLiveAi: false,
      requestId: "test-request-id"
    });
  });

  it("does not include secret values in the response", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SMOKE_SECRET", "super-secret-value");
    runStagingSmokeBootstrapMock.mockResolvedValue(safeSmokeResult);
    const { POST } = await import("./route");

    const response = await POST(stagingRequest({ secret: "super-secret-value" }));
    const text = await response.text();

    expect(text).not.toContain("super-secret-value");
    expect(text).not.toContain("SMOKE_PASSWORD");
    expect(text).not.toContain("pgs_session");
  });
});
