import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  createAction: vi.fn(),
  createAudit: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectActionItem: { findMany: vi.fn(), create: mocks.createAction },
    auditLog: { create: mocks.createAudit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectActionItem: { create: mocks.createAction },
      auditLog: { create: mocks.createAudit }
    }))
  }
}));

const item = {
  id: "action-1",
  organizationId: "org-1",
  projectId: "project-1",
  createdBy: "user-1",
  title: "Согласовать замену материала",
  description: null,
  sourceModule: "Материалы",
  targetTab: "Материалы",
  priority: "high",
  status: "open",
  assignee: "РП",
  dueAt: null,
  completedAt: null,
  requiresApproval: false,
  approvedAt: null,
  approvedBy: null,
  createdAt: new Date("2026-07-14T12:00:00.000Z"),
  updatedAt: new Date("2026-07-14T12:00:00.000Z")
};

describe("project actions collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true });
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ organizationId: "org-1" } as never);
    vi.mocked(prisma.projectActionItem.findMany).mockResolvedValue([item] as never);
    mocks.createAction.mockResolvedValue(item);
  });

  it("guards reads before querying actions", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.projectActionItem.findMany).not.toHaveBeenCalled();
  });

  it("returns the action register with summary", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({ total: 1, open: 1 });
    expect(canProject).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }), "project-1", "view");
  });

  it("requires edit permission before parsing or writing", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });
});
