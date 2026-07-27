import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  createAction: vi.fn(),
  createLink: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiRun: { findFirst: mocks.findFirst },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        projectActionItem: { create: mocks.createAction },
        aiRunAction: { create: mocks.createLink },
        auditLog: { create: mocks.audit }
      })
    )
  }
}));

const user = { id: "user-1", name: "User", email: "user@pgs.local", role: "MANAGER" as const, authenticated: true };
const now = new Date("2026-07-27T10:00:00.000Z");
const action = {
  id: "action-1",
  projectId: "project-1",
  title: "Обновить график",
  description: "Проверить критический путь",
  sourceModule: "ai-decision-journal",
  targetTab: "График",
  priority: "high",
  status: "open",
  assignee: null,
  dueAt: null,
  completedAt: null,
  requiresApproval: false,
  approvedAt: null,
  approvedBy: null,
  createdAt: now,
  updatedAt: now
};
const run = {
  id: "run-1",
  organizationId: "org-1",
  projectId: "project-1",
  outputJson: {
    title: "Проверка графика",
    scenario: "schedule-review",
    summary: "Есть отклонение",
    findings: [],
    recommendedActions: [{ priority: "high", title: action.title, description: action.description }],
    dataUsed: ["График"],
    dataLimitations: [],
    generatedAt: now.toISOString(),
    provider: "deterministic"
  },
  actionLinks: []
};

function request(body: unknown) {
  return new NextRequest("https://pgs.local/api/projects/project-1/ai-runs/run-1/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("AI recommendation action endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(canProject).mockResolvedValue(true);
    mocks.findFirst.mockResolvedValue(run);
    mocks.createAction.mockResolvedValue(action);
    mocks.createLink.mockResolvedValue({ id: "link-1" });
    mocks.audit.mockResolvedValue({});
  });

  it("requires edit access before reading the request body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");

    const response = await POST(request({ actionIndex: 0 }), { params: { projectId: "project-1", runId: "run-1" } });

    expect(response.status).toBe(403);
    expect(canProject).toHaveBeenCalledWith(user, "project-1", "edit");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("creates an action only after an explicit request and links it to the run", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({ actionIndex: 0 }), { params: { projectId: "project-1", runId: "run-1" } });
    const data = (await response.json()) as { item: { id: string; targetTab: string }; alreadyCreated: boolean };

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ item: { id: "action-1", targetTab: "График" }, alreadyCreated: false });
    expect(mocks.createAction).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: "Обновить график",
        sourceModule: "ai-decision-journal",
        targetTab: "График"
      })
    }));
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aiRunId: "run-1", actionIndex: 0, actionItemId: "action-1" })
    }));
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("returns an existing action instead of creating a duplicate", async () => {
    mocks.findFirst.mockResolvedValue({ ...run, actionLinks: [{ actionIndex: 0, actionItem: action }] });
    const { POST } = await import("./route");

    const response = await POST(request({ actionIndex: 0 }), { params: { projectId: "project-1", runId: "run-1" } });
    const data = (await response.json()) as { alreadyCreated: boolean };

    expect(response.status).toBe(200);
    expect(data.alreadyCreated).toBe(true);
    expect(mocks.createAction).not.toHaveBeenCalled();
  });
});
