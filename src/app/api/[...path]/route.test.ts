import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/permissions";

const getCurrentUserMock = vi.fn();
const canProjectMock = vi.fn();
const getEffectiveProjectRoleMock = vi.fn();
const askProjectAssistantMock = vi.fn();
const buildProjectContextMock = vi.fn();
const localAiFallbackMock = vi.fn();
const projectFindUniqueMock = vi.fn();
const projectCreateMock = vi.fn();
const deleteProjectWithConfirmationMock = vi.fn();
const getDemoContextMock = vi.fn();
const listProjectsFromDbMock = vi.fn();
const getProjectBundleFromDbMock = vi.fn();

class MockProjectDeleteError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: canProjectMock,
  getEffectiveProjectRole: getEffectiveProjectRoleMock
}));

vi.mock("@/lib/ai", () => ({
  askProjectAssistant: askProjectAssistantMock,
  buildProjectContext: buildProjectContextMock,
  localAiFallback: localAiFallbackMock
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: projectFindUniqueMock,
      create: projectCreateMock
    }
  }
}));

vi.mock("@/lib/project-data", () => ({
  getDemoContext: getDemoContextMock,
  listProjectsFromDb: listProjectsFromDbMock,
  getProjectBundleFromDb: getProjectBundleFromDbMock
}));

vi.mock("@/lib/project-delete", () => ({
  deleteProjectWithConfirmation: deleteProjectWithConfirmationMock,
  ProjectDeleteError: MockProjectDeleteError
}));

const authorizedUser: AppUser = {
  id: "user-1",
  name: "Owner",
  email: "owner@pgs.local",
  role: "OWNER",
  authenticated: true
};

function postRequest(body: unknown = { prompt: "Что важно?" }) {
  return new Request("https://pgs.local/api/projects/project-demo/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

function getRequest() {
  return new Request("https://pgs.local/api/projects/project-demo/ai/summary") as never;
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("catch-all AI routes", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    canProjectMock.mockReset();
    getEffectiveProjectRoleMock.mockReset();
    askProjectAssistantMock.mockReset();
    buildProjectContextMock.mockReset();
    localAiFallbackMock.mockReset();
    projectFindUniqueMock.mockReset();
    projectCreateMock.mockReset();
    deleteProjectWithConfirmationMock.mockReset();
    getDemoContextMock.mockReset();
    listProjectsFromDbMock.mockReset();
    getProjectBundleFromDbMock.mockReset();
  });

  it("keeps unauthenticated project creation forbidden before body parsing", async () => {
    const jsonMock = vi.fn().mockResolvedValue({ name: "Нельзя читать" });
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST({ json: jsonMock } as never, { params: { path: ["projects"] } });

    expect(response.status).toBe(403);
    await expect(responseJson(response)).resolves.toEqual({ error: "Forbidden" });
    expect(jsonMock).not.toHaveBeenCalled();
    expect(projectCreateMock).not.toHaveBeenCalled();
  });

  it("returns safe validation errors for invalid project creation payload", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    const { POST } = await import("./route");

    const response = await POST(postRequest({ name: "" }) as never, { params: { path: ["projects"] } });
    const body = await responseJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("Validation error");
    expect(JSON.stringify(body)).not.toContain("PrismaClient");
    expect(projectCreateMock).not.toHaveBeenCalled();
  });

  it("creates a project through supported schema fields only", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    getDemoContextMock.mockResolvedValue({ organizationId: "org-demo", userId: "user-demo" });
    projectCreateMock.mockResolvedValue({
      id: "project-new",
      organizationId: "org-demo",
      name: "Новый объект",
      customer: "Заказчик",
      object: "Административное здание",
      address: "Москва",
      contractAmount: 1000000,
      vatMode: "vat",
      startsAt: new Date("2026-07-01"),
      endsAt: new Date("2026-09-01"),
      manager: "РП",
      status: "planning",
      isSmokeProject: false
    });
    const { POST } = await import("./route");

    const response = await POST(
      postRequest({
        name: "Новый объект",
        customer: "Заказчик",
        object: "Административное здание",
        address: "Москва",
        contractAmount: 1000000,
        vatMode: "vat",
        startsAt: "2026-07-01",
        endsAt: "2026-09-01",
        manager: "РП",
        status: "planning",
        unsupportedOnboardingNote: "ignored by schema"
      }) as never,
      { params: { path: ["projects"] } }
    );
    const body = await responseJson(response);

    expect(response.status).toBe(201);
    expect(body.project).toMatchObject({ id: "project-new", name: "Новый объект" });
    expect(projectCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-demo",
        name: "Новый объект",
        customer: "Заказчик",
        object: "Административное здание",
        address: "Москва",
        manager: "РП",
        status: "planning"
      })
    });
    expect(JSON.stringify(projectCreateMock.mock.calls[0][0].data)).not.toContain("unsupportedOnboardingNote");
  });

  it("keeps unauthenticated AI requests forbidden before project lookup", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(), { params: { path: ["projects", "project-demo", "ai", "chat"] } });

    expect(response.status).toBe(403);
    await expect(responseJson(response)).resolves.toEqual({ error: "Forbidden" });
    expect(projectFindUniqueMock).not.toHaveBeenCalled();
    expect(canProjectMock).not.toHaveBeenCalled();
    expect(askProjectAssistantMock).not.toHaveBeenCalled();
  });

  it("returns 404 for authenticated AI requests to a missing project before fallback", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    projectFindUniqueMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(), { params: { path: ["projects", "missing-project", "ai", "chat"] } });

    expect(response.status).toBe(404);
    await expect(responseJson(response)).resolves.toEqual({ error: "Project not found" });
    expect(projectFindUniqueMock).toHaveBeenCalledWith({ where: { id: "missing-project" }, select: { id: true } });
    expect(canProjectMock).not.toHaveBeenCalled();
    expect(askProjectAssistantMock).not.toHaveBeenCalled();
  });

  it("keeps forbidden AI behavior for users without project access", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo" });
    canProjectMock.mockResolvedValue(false);
    const { POST } = await import("./route");

    const response = await POST(postRequest(), { params: { path: ["projects", "project-demo", "ai", "chat"] } });

    expect(response.status).toBe(403);
    await expect(responseJson(response)).resolves.toEqual({ error: "Forbidden" });
    expect(canProjectMock).toHaveBeenCalledWith(authorizedUser, "project-demo", "view");
    expect(askProjectAssistantMock).not.toHaveBeenCalled();
  });

  it("keeps controlled degraded AI behavior for accessible projects", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo" });
    canProjectMock.mockResolvedValue(true);
    askProjectAssistantMock.mockResolvedValue({
      ok: false,
      status: 503,
      response: "local fallback",
      error: "OPENAI_API_KEY is not configured"
    });
    const { POST } = await import("./route");

    const response = await POST(postRequest(), { params: { path: ["projects", "project-demo", "ai", "chat"] } });

    expect(response.status).toBe(503);
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      response: "local fallback",
      error: "OPENAI_API_KEY is not configured"
    });
    expect(askProjectAssistantMock).toHaveBeenCalledWith("project-demo", "Что важно?");
  });

  it("passes through controlled provider failures without turning them into raw 500s", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo" });
    canProjectMock.mockResolvedValue(true);
    askProjectAssistantMock.mockResolvedValue({
      ok: false,
      status: 502,
      response: "AI-провайдер временно недоступен.",
      error: "AI provider request failed"
    });
    const { POST } = await import("./route");

    const response = await POST(postRequest(), { params: { path: ["projects", "project-demo", "ai", "chat"] } });

    expect(response.status).toBe(502);
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      response: "AI-провайдер временно недоступен.",
      error: "AI provider request failed"
    });
    expect(askProjectAssistantMock).toHaveBeenCalledWith("project-demo", "Что важно?");
  });

  it("returns 404 for AI summary on a missing project before context fallback", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    projectFindUniqueMock.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(getRequest(), { params: { path: ["projects", "missing-project", "ai", "summary"] } });

    expect(response.status).toBe(404);
    await expect(responseJson(response)).resolves.toEqual({ error: "Project not found" });
    expect(canProjectMock).not.toHaveBeenCalled();
    expect(buildProjectContextMock).not.toHaveBeenCalled();
  });

  it("requires authentication before project delete confirmation parsing", async () => {
    const jsonMock = vi.fn().mockResolvedValue({ confirm: true, projectName: "Демо" });
    getCurrentUserMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");

    const response = await DELETE({ json: jsonMock } as never, { params: { path: ["projects", "project-demo"] } });

    expect(response.status).toBe(401);
    await expect(responseJson(response)).resolves.toEqual({ error: "Unauthorized" });
    expect(jsonMock).not.toHaveBeenCalled();
    expect(canProjectMock).not.toHaveBeenCalled();
    expect(deleteProjectWithConfirmationMock).not.toHaveBeenCalled();
  });

  it("rejects project delete for users without delete access before confirmation parsing", async () => {
    const jsonMock = vi.fn().mockResolvedValue({ confirm: true, projectName: "Демо" });
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(false);
    const { DELETE } = await import("./route");

    const response = await DELETE({ json: jsonMock } as never, { params: { path: ["projects", "project-demo"] } });

    expect(response.status).toBe(403);
    await expect(responseJson(response)).resolves.toEqual({ error: "Forbidden" });
    expect(canProjectMock).toHaveBeenCalledWith(authorizedUser, "project-demo", "delete");
    expect(jsonMock).not.toHaveBeenCalled();
    expect(deleteProjectWithConfirmationMock).not.toHaveBeenCalled();
  });

  it("requires exact project delete confirmation for users with delete access", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    deleteProjectWithConfirmationMock.mockRejectedValue(new MockProjectDeleteError(400, "Exact project name confirmation is required."));
    const { DELETE } = await import("./route");

    const response = await DELETE(postRequest({}) as never, { params: { path: ["projects", "project-demo"] } });

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Exact project name confirmation is required." });
    expect(deleteProjectWithConfirmationMock).toHaveBeenCalledWith({
      projectId: "project-demo",
      actor: authorizedUser,
      confirmation: {}
    });
  });
});
