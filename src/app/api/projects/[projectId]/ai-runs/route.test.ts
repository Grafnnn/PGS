import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn()
}));

vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiRun: {
      findMany: vi.fn()
    }
  }
}));

const user = { id: "user-1", name: "User", email: "user@pgs.local", role: "MANAGER" as const, authenticated: true };
const run = {
  id: "run-1",
  organizationId: "org-1",
  projectId: "project-1",
  userId: "user-1",
  scenario: "summary",
  promptVersion: "ai-command-v1",
  inputJson: { scenario: "summary" },
  outputJson: {
    title: "Сводка",
    scenario: "summary",
    summary: "Контролируемый результат",
    findings: [],
    recommendedActions: [],
    dataUsed: ["Проект"],
    dataLimitations: [],
    generatedAt: "2026-07-27T10:00:00.000Z",
    provider: "deterministic"
  },
  status: "succeeded",
  provider: "deterministic",
  durationMs: 42,
  sanitizedError: null,
  feedback: null,
  feedbackComment: null,
  feedbackBy: null,
  feedbackAt: null,
  completedAt: new Date("2026-07-27T10:00:00.000Z"),
  createdAt: new Date("2026-07-27T10:00:00.000Z"),
  actionLinks: []
};

describe("AI run history endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.aiRun.findMany).mockResolvedValue([run] as never);
  });

  it("rejects unauthenticated access before project and database checks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("https://pgs.local/api/projects/project-1/ai-runs"), { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
    expect(canProject).not.toHaveBeenCalled();
    expect(prisma.aiRun.findMany).not.toHaveBeenCalled();
  });

  it("rejects users without project access", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("https://pgs.local/api/projects/project-1/ai-runs"), { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
    expect(prisma.aiRun.findMany).not.toHaveBeenCalled();
  });

  it("returns newest runs with bounded limit and action links", async () => {
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("https://pgs.local/api/projects/project-1/ai-runs?limit=500"), { params: { projectId: "project-1" } });
    const data = (await response.json()) as { items: Array<{ id: string; promptVersion: string }>; summary: { succeeded: number } };

    expect(response.status).toBe(200);
    expect(data.items[0]).toMatchObject({ id: "run-1", promptVersion: "ai-command-v1" });
    expect(data.summary.succeeded).toBe(1);
    expect(prisma.aiRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: "project-1" },
      take: 50,
      orderBy: { createdAt: "desc" }
    }));
  });
});
