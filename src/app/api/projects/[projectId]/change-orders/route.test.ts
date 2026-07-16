import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({ latest: vi.fn(), create: vi.fn(), audit: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "manager-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true })) }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: vi.fn() }, document: { findFirst: vi.fn() }, budgetItem: { findMany: vi.fn() }, projectChangeOrder: { findMany: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ projectChangeOrder: { findFirst: mocks.latest, create: mocks.create }, auditLog: { create: mocks.audit } }))
} }));

const now = new Date("2026-07-16T10:00:00Z");
const created = { id: "co-1", organizationId: "org-1", projectId: "project-1", sequence: 1, number: "CHG-001", kind: "potential", scope: "out_of_scope", title: "Дополнительный объем", description: null, reason: "Изменение проекта", sourceType: "RFI", sourceRef: "RFI-7", counterparty: null, status: "draft", currency: "RUB", scheduleImpactDays: 2, estimatedAmount: 100, proposedAmount: 110, submittedAmount: 120, approvedAmount: 0, committedAmount: 0, linkedDocumentId: null, linkedDocumentVersion: null, linkedDocumentVersionId: null, approvalWorkflowRunId: null, decisionComment: null, dueAt: null, submittedAt: null, approvedAt: null, executedAt: null, rejectedAt: null, voidedAt: null, createdAt: now, updatedAt: now, linkedDocument: null, approvalWorkflowRun: null, items: [{ id: "line-1", budgetItemId: null, sequence: 1, code: null, description: "Работы", quantity: 1, unit: "компл.", estimatedUnitPrice: 100, proposedUnitPrice: 110, submittedUnitPrice: 120, approvedUnitPrice: 0, committedUnitPrice: 0 }] };

function request(body: unknown) { return new Request("https://pgs.local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never; }

describe("change order collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(canProject).mockResolvedValue(true); vi.mocked(prisma.project.findUnique).mockResolvedValue({ organizationId: "org-1" } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null); vi.mocked(prisma.budgetItem.findMany).mockResolvedValue([]); mocks.latest.mockResolvedValue(null); mocks.create.mockResolvedValue(created);
  });

  it("checks edit access before parsing the body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403); expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("creates a numbered draft with cost lines and audit", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ title: "Дополнительный объем", reason: "Изменение проекта", sourceType: "RFI", sourceRef: "RFI-7", scheduleImpactDays: 2, items: [{ description: "Работы", quantity: 1, unit: "компл.", estimatedUnitPrice: 100, proposedUnitPrice: 110, submittedUnitPrice: 120 }] }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ number: "CHG-001", submittedAmount: 120 }) }));
    expect(mocks.audit).toHaveBeenCalled();
  });
});
