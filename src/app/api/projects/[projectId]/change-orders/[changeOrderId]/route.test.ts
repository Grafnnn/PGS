import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), updateOrder: vi.fn(), createRun: vi.fn(), updateLine: vi.fn(), deleteOrder: vi.fn(), audit: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true })) }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: vi.fn(async () => "OWNER") }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  projectChangeOrder: { findFirst: vi.fn() }, projectWorkflowTemplate: { findFirst: vi.fn() }, document: { findFirst: vi.fn() }, budgetItem: { findMany: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ projectChangeOrder: { updateMany: mocks.claim, update: mocks.updateOrder, delete: mocks.deleteOrder }, projectWorkflowRun: { create: mocks.createRun }, projectChangeOrderItem: { update: mocks.updateLine }, auditLog: { create: mocks.audit } }))
} }));

const now = new Date("2026-07-16T10:00:00Z");
const line = { id: "line-1", budgetItemId: null, sequence: 1, code: null, description: "Допработы", quantity: 1, unit: "компл.", estimatedUnitPrice: 100, proposedUnitPrice: 110, submittedUnitPrice: 120, approvedUnitPrice: 0, committedUnitPrice: 0 };
const base = { id: "co-1", organizationId: "org-1", projectId: "project-1", sequence: 1, number: "CHG-001", kind: "potential", scope: "out_of_scope", title: "Допработы", description: null, reason: "RFI-7", sourceType: "RFI", sourceRef: "RFI-7", counterparty: null, status: "open", currency: "RUB", scheduleImpactDays: 0, estimatedAmount: 100, proposedAmount: 110, submittedAmount: 120, approvedAmount: 0, committedAmount: 0, linkedDocumentId: null, linkedDocumentVersion: null, linkedDocumentVersionId: null, approvalWorkflowRunId: null, decisionComment: null, dueAt: null, submittedAt: null, approvedAt: null, executedAt: null, rejectedAt: null, voidedAt: null, createdAt: now, updatedAt: now, linkedDocument: null, approvalWorkflowRun: null, items: [line] };
const submitted = { ...base, status: "submitted", submittedAt: now };
function request(body: unknown, method = "PATCH") { return new Request("https://pgs.local", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never; }

describe("change order item route", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(getEffectiveProjectRole).mockResolvedValue("OWNER"); vi.mocked(prisma.projectChangeOrder.findFirst).mockResolvedValue(base as never);
    vi.mocked(prisma.projectWorkflowTemplate.findFirst).mockResolvedValue(null); mocks.claim.mockResolvedValue({ count: 1 }); mocks.createRun.mockResolvedValue({ id: "run-1" }); mocks.updateLine.mockResolvedValue(line); mocks.updateOrder.mockResolvedValue(submitted); mocks.deleteOrder.mockResolvedValue(base);
  });

  it("checks project role before parsing", async () => {
    vi.mocked(getEffectiveProjectRole).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", body: "not-json" }) as never, { params: { projectId: "project-1", changeOrderId: "co-1" } });
    expect(response.status).toBe(403); expect(prisma.projectChangeOrder.findFirst).not.toHaveBeenCalled();
  });

  it("submits priced lines and can start an approval workflow", async () => {
    vi.mocked(prisma.projectWorkflowTemplate.findFirst).mockResolvedValue({ id: "template-1", projectId: "project-1", status: "active", steps: [{ id: "step-1", sequence: 1, name: "Решение", description: null, stepType: "approval", assigneeRole: "OWNER", dueDays: 2 }] } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "submit", workflowTemplateId: "template-1" }), { params: { projectId: "project-1", changeOrderId: "co-1" } });
    expect(response.status).toBe(200); expect(mocks.createRun).toHaveBeenCalled(); expect(mocks.updateOrder).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "submitted", approvalWorkflowRunId: "run-1" }) })); expect(mocks.audit).toHaveBeenCalled();
  });

  it("does not approve before the linked workflow is approved", async () => {
    vi.mocked(prisma.projectChangeOrder.findFirst).mockResolvedValue({ ...submitted, approvalWorkflowRunId: "run-1", approvalWorkflowRun: { id: "run-1", title: "Согласование", status: "active" } } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "approve" }), { params: { projectId: "project-1", changeOrderId: "co-1" } });
    expect(response.status).toBe(409); expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not bypass an active workflow with a direct rejection", async () => {
    vi.mocked(prisma.projectChangeOrder.findFirst).mockResolvedValue({ ...submitted, approvalWorkflowRunId: "run-1", approvalWorkflowRun: { id: "run-1", title: "Согласование", status: "active" } } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "reject", comment: "Отклонить" }), { params: { projectId: "project-1", changeOrderId: "co-1" } });
    expect(response.status).toBe(409); expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a duplicate concurrent decision", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "submit" }), { params: { projectId: "project-1", changeOrderId: "co-1" } });
    expect(response.status).toBe(409); expect(mocks.updateOrder).not.toHaveBeenCalled();
  });
});
