import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({ claimRun: vi.fn(), updateStep: vi.fn(), updateManySteps: vi.fn(), updateRun: vi.fn(), createAudit: vi.fn(async () => ({})) }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true })) }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: vi.fn(async () => "OWNER") }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectWorkflowRun: { findFirst: vi.fn(), update: mocks.updateRun },
    projectWorkflowRunStep: { update: mocks.updateStep, updateMany: mocks.updateManySteps },
    auditLog: { create: mocks.createAudit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ projectWorkflowRun: { update: mocks.updateRun, updateMany: mocks.claimRun }, projectWorkflowRunStep: { update: mocks.updateStep, updateMany: mocks.updateManySteps }, auditLog: { create: mocks.createAudit } }))
  }
}));

const step = { id: "step-1", sequence: 1, name: "Финальное решение", description: null, stepType: "approval", assigneeRole: "OWNER", dueDays: 1, status: "active", dueAt: new Date("2026-07-16T10:00:00.000Z"), decisionComment: null, actedByName: null, actedAt: null };
const run = { id: "run-1", organizationId: "org-1", projectId: "project-1", templateId: "template-1", title: "Договор №1", description: null, sourceModule: "contract", targetTab: "Договор / Тендер", referenceType: null, referenceId: null, status: "active", currentStep: 1, startedAt: new Date("2026-07-15T10:00:00.000Z"), completedAt: null, createdAt: new Date("2026-07-15T10:00:00.000Z"), updatedAt: new Date("2026-07-15T10:00:00.000Z"), steps: [step] };
const approvedRun = { ...run, status: "approved", completedAt: new Date("2026-07-15T11:00:00.000Z"), steps: [{ ...step, status: "approved", actedByName: "Owner", actedAt: new Date("2026-07-15T11:00:00.000Z") }] };

describe("workflow decision route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true });
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("OWNER");
    vi.mocked(prisma.projectWorkflowRun.findFirst).mockResolvedValue(run as never);
    mocks.claimRun.mockResolvedValue({ count: 1 });
    mocks.updateStep.mockResolvedValue({ ...step, status: "approved" });
    mocks.updateManySteps.mockResolvedValue({ count: 0 });
    mocks.updateRun.mockResolvedValue(approvedRun);
  });

  it("rejects before parsing when the user has no project role", async () => {
    vi.mocked(getEffectiveProjectRole).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", body: "not-json" }) as never, { params: { projectId: "project-1", runId: "run-1" } });
    expect(response.status).toBe(403);
    expect(prisma.projectWorkflowRun.findFirst).not.toHaveBeenCalled();
  });

  it("keeps an OWNER step out of a MANAGER ball in court", async () => {
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("MANAGER");
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) }) as never, { params: { projectId: "project-1", runId: "run-1" } });
    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("approves the final step and writes audit in one transaction", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", comment: "Условия проверены" }) }) as never, { params: { projectId: "project-1", runId: "run-1" } });
    expect(response.status).toBe(200);
    expect(mocks.updateStep).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "approved", decisionComment: "Условия проверены" }) }));
    expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) }));
    expect(mocks.createAudit).toHaveBeenCalled();
  });

  it("rejects a concurrent decision after another request claims the run", async () => {
    mocks.claimRun.mockResolvedValue({ count: 0 });
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) }) as never, { params: { projectId: "project-1", runId: "run-1" } });
    expect(response.status).toBe(409);
    expect(mocks.updateStep).not.toHaveBeenCalled();
    expect(mocks.updateRun).not.toHaveBeenCalled();
  });
});
