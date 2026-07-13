import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createSessionMock = vi.fn();
const closeSessionMock = vi.fn();

vi.mock("@/lib/smoke/browser-session", () => ({
  STAGING_BROWSER_SESSION_MINUTES: 20,
  createStagingBrowserSmokeSession: createSessionMock,
  closeStagingBrowserSmokeSession: closeSessionMock
}));

function request(method: "POST" | "DELETE", secret = "expected-secret", cookie?: string) {
  const headers = new Headers({ "x-pgs-staging-smoke-secret": secret, "x-request-id": "browser-smoke-test" });
  if (cookie) headers.set("cookie", `pgs_session=${cookie}`);
  return new NextRequest("https://pgs.local/api/internal/staging-smoke/browser-session", { method, headers });
}

describe("staging browser smoke session", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
    closeSessionMock.mockReset();
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("is hidden outside staging and rejects invalid secrets", async () => {
    const { POST } = await import("./route");
    vi.stubEnv("APP_ENV", "production");
    expect((await POST(request("POST"))).status).toBe(404);
    vi.stubEnv("APP_ENV", "staging");
    expect((await POST(request("POST", "wrong"))).status).toBe(403);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("sets an HttpOnly short-lived cookie without returning credentials", async () => {
    createSessionMock.mockResolvedValue({
      token: "private-session-token",
      expiresAt: new Date("2026-07-14T12:20:00.000Z"),
      report: { ok: true, role: "temporary-admin", expiresInMinutes: 20, secretsPrinted: false }
    });
    const { POST } = await import("./route");
    const response = await POST(request("POST"));
    const body = await response.text();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("pgs_session=private-session-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(body).not.toContain("private-session-token");
    expect(body).not.toContain("expected-secret");
  });

  it("revokes the browser session and restores the smoke role", async () => {
    closeSessionMock.mockResolvedValue({ ok: true, roleRestored: true, sessionsRevoked: true, secretsPrinted: false });
    const { DELETE } = await import("./route");
    const response = await DELETE(request("DELETE", "expected-secret", "private-session-token"));

    expect(response.status).toBe(200);
    expect(closeSessionMock).toHaveBeenCalledWith("private-session-token");
    expect(await response.json()).toEqual({ ok: true, roleRestored: true, sessionsRevoked: true, secretsPrinted: false });
  });
});
