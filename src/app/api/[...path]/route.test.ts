import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/permissions";

const getCurrentUserMock = vi.fn();
const canProjectMock = vi.fn();
const askProjectAssistantMock = vi.fn();
const buildProjectContextMock = vi.fn();
const localAiFallbackMock = vi.fn();
const projectFindUniqueMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: canProjectMock
}));

vi.mock("@/lib/ai", () => ({
  askProjectAssistant: askProjectAssistantMock,
  buildProjectContext: buildProjectContextMock,
  localAiFallback: localAiFallbackMock
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: projectFindUniqueMock
    }
  }
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
    askProjectAssistantMock.mockReset();
    buildProjectContextMock.mockReset();
    localAiFallbackMock.mockReset();
    projectFindUniqueMock.mockReset();
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
});
