import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deleteProjectWithConfirmationMock = vi.fn();

class MockProjectDeleteError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ProjectDeleteError";
  }
}

vi.mock("@/lib/project-delete", () => ({
  ProjectDeleteError: MockProjectDeleteError,
  deleteProjectWithConfirmation: deleteProjectWithConfirmationMock
}));

function request(input?: { secret?: string; bearer?: boolean; body?: unknown }) {
  const headers = new Headers({ "content-type": "application/json", "x-request-id": "delete-demo-request-id" });
  if (input?.secret && input.bearer) headers.set("authorization", `Bearer ${input.secret}`);
  if (input?.secret && !input.bearer) headers.set("x-pgs-staging-smoke-secret", input.secret);

  return new NextRequest("https://pgs.local/api/internal/staging-delete-demo-project", {
    method: "POST",
    headers,
    body: JSON.stringify(input?.body ?? {})
  });
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

const exactBody = {
  confirm: true,
  projectId: "project-demo",
  projectName: "Демо объект: строительство административного корпуса"
};

describe("staging delete demo project endpoint", () => {
  beforeEach(() => {
    deleteProjectWithConfirmationMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled outside APP_ENV=staging", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    const { POST } = await import("./route");

    const response = await POST(request({ secret: "expected-secret", body: exactBody }));

    expect(response.status).toBe(404);
    expect(await responseJson(response)).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(deleteProjectWithConfirmationMock).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid staging smoke secrets", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SMOKE_SECRET", "");
    const { POST } = await import("./route");

    const missing = await POST(request({ body: exactBody }));
    expect(missing.status).toBe(403);
    expect(await responseJson(missing)).toMatchObject({ error: { code: "STAGING_SMOKE_SECRET_MISSING" } });

    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    const invalid = await POST(request({ secret: "wrong-secret", body: exactBody }));
    expect(invalid.status).toBe(403);
    expect(await responseJson(invalid)).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(deleteProjectWithConfirmationMock).not.toHaveBeenCalled();
  });

  it("requires exact demo project confirmation", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    const { POST } = await import("./route");

    const wrongProject = await POST(request({ secret: "expected-secret", body: { ...exactBody, projectId: "project-smoke" } }));
    expect(wrongProject.status).toBe(400);
    expect(await responseJson(wrongProject)).toMatchObject({ error: { code: "INVALID_CONFIRMATION" } });

    const wrongName = await POST(request({ secret: "expected-secret", body: { ...exactBody, projectName: "Другое имя" } }));
    expect(wrongName.status).toBe(400);
    expect(await responseJson(wrongName)).toMatchObject({ error: { code: "INVALID_CONFIRMATION" } });
    expect(deleteProjectWithConfirmationMock).not.toHaveBeenCalled();
  });

  it("deletes only project-demo through the transactional helper without returning secrets", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SMOKE_SECRET", "expected-secret");
    deleteProjectWithConfirmationMock.mockResolvedValue({
      ok: true,
      deletedProjectId: "project-demo",
      deletedProjectName: exactBody.projectName,
      deletedCounts: { budgetItems: 3 }
    });
    const { POST } = await import("./route");

    const response = await POST(request({ secret: "expected-secret", bearer: true, body: exactBody }));
    const body = await responseJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      deletedProjectId: "project-demo",
      deletedProjectName: exactBody.projectName,
      secretsPrinted: false
    });
    expect(JSON.stringify(body)).not.toContain("expected-secret");
    expect(deleteProjectWithConfirmationMock).toHaveBeenCalledWith({
      projectId: "project-demo",
      actor: expect.objectContaining({
        id: "internal-staging-maintenance",
        role: "OWNER",
        authenticated: false
      }),
      confirmation: {
        confirm: true,
        projectName: exactBody.projectName
      }
    });
  });
});
