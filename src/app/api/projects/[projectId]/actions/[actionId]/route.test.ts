import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  updateAction: vi.fn(),
  deleteAction: vi.fn(),
  createAudit: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectActionItem: { findUnique: vi.fn(), update: mocks.updateAction, delete: mocks.deleteAction },
    auditLog: { create: mocks.createAudit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectActionItem: { update: mocks.updateAction, delete: mocks.deleteAction },
      auditLog: { create: mocks.createAudit }
    }))
  }
}));

const before = {
  id: "action-1",
  organizationId: "org-1",
  projectId: "project-1",
  createdBy: "user-1",
  title: "Подтвердить исполнительную схему",
  description: null,
  sourceModule: "Документы",
  targetTab: "Документы",
  priority: "high",
  status: "waiting_approval",
  assignee: "ПТО",
  dueAt: null,
  completedAt: null,
  requiresApproval: true,
  approvedAt: null,
  approvedBy: null,
  createdAt: new Date("2026-07-14T12:00:00.000Z"),
  updatedAt: new Date("2026-07-14T12:00:00.000Z")
};

function request(body: unknown) {
  return new Request("https://pgs.local/api/projects/project-1/actions/action-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("project action item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true });
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.projectActionItem.findUnique).mockResolvedValue(before as never);
    mocks.updateAction.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...before, ...data, updatedAt: new Date("2026-07-14T12:05:00.000Z") }));
    mocks.deleteAction.mockResolvedValue(before);
  });

  it("guards mutation before loading the action", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "done" }) as never, { params: { projectId: "project-1", actionId: "action-1" } });
    expect(response.status).toBe(403);
    expect(prisma.projectActionItem.findUnique).not.toHaveBeenCalled();
  });

  it("does not allow completion before required approval", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "done" }) as never, { params: { projectId: "project-1", actionId: "action-1" } });
    expect(response.status).toBe(409);
    expect(mocks.updateAction).not.toHaveBeenCalled();
  });

  it("does not allow adding required approval to an already completed action", async () => {
    vi.mocked(prisma.projectActionItem.findUnique).mockResolvedValue({ ...before, status: "done", requiresApproval: false } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ requiresApproval: true }) as never, { params: { projectId: "project-1", actionId: "action-1" } });
    expect(response.status).toBe(409);
    expect(mocks.updateAction).not.toHaveBeenCalled();
  });

  it("rejects approval when the action does not require it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-owner", name: "Владелец", email: "owner@example.test", role: "OWNER", authenticated: true });
    vi.mocked(prisma.projectActionItem.findUnique).mockResolvedValue({ ...before, requiresApproval: false } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ approve: true }) as never, { params: { projectId: "project-1", actionId: "action-1" } });
    expect(response.status).toBe(409);
    expect(mocks.updateAction).not.toHaveBeenCalled();
  });

  it("records approval and closes the action atomically", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-owner", name: "Владелец", email: "owner@example.test", role: "OWNER", authenticated: true });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ approve: true }) as never, { params: { projectId: "project-1", actionId: "action-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.item.status).toBe("done");
    expect(body.item.approvedBy).toBe("Владелец");
    expect(mocks.updateAction).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "done", approvedBy: "Владелец" }) }));
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "accept" }) }));
  });

  it("keeps approval restricted to owners and administrators", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ approve: true }) as never, { params: { projectId: "project-1", actionId: "action-1" } });
    expect(response.status).toBe(403);
    expect(mocks.updateAction).not.toHaveBeenCalled();
  });
});
