import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  effectiveRole: vi.fn(),
  requestFindFirst: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findFirstOrThrow: vi.fn(),
  requestUpdate: vi.fn(),
  itemUpdate: vi.fn(),
  itemFindMany: vi.fn(),
  materialFindFirst: vi.fn(),
  materialUpdate: vi.fn(),
  queryRaw: vi.fn()
}));

vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: (...args: unknown[]) => mocks.requireAccess(...args) }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: (...args: unknown[]) => mocks.effectiveRole(...args) }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...args: unknown[]) => mocks.audit(...args) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    procurementRequest: { findFirst: (...args: unknown[]) => mocks.requestFindFirst(...args) },
    $transaction: (...args: unknown[]) => mocks.transaction(...args)
  }
}));

const now = new Date("2026-09-02T10:00:00.000Z");

function requestRecord(status: string, receivedQty = 0) {
  return {
    id: "request-1", organizationId: "org-1", projectId: "project-1", requestNumber: "SUP-001", title: "Мембрана", initiator: "ПТО",
    neededAt: new Date("2026-09-18T00:00:00.000Z"), expectedAt: null, leadTimeDays: 14, groupKey: "roof", priority: "high", status,
    submittedAt: null, approvedAt: null, approvedBy: null, receivedAt: null, createdBy: "user-1", createdAt: now, updatedAt: now,
    items: [{ id: "line-1", requestId: "request-1", costCodeId: null, materialId: "material-1", name: "Мембрана", qty: new Prisma.Decimal(100), receivedQty: new Prisma.Decimal(receivedQty), unit: "м2", comment: null, createdAt: now, updatedAt: now }]
  };
}

function materialRecord(delivered = 0, ordered = 0) {
  return {
    id: "material-1", organizationId: "org-1", projectId: "project-1", costCodeId: null, name: "Мембрана", unit: "м2",
    requiredQty: new Prisma.Decimal(100), orderedQty: new Prisma.Decimal(ordered), deliveredQty: new Prisma.Decimal(delivered), consumedQty: new Prisma.Decimal(0),
    plannedUnitPrice: new Prisma.Decimal(500), actualUnitPrice: new Prisma.Decimal(0), supplier: null, neededAt: new Date("2026-09-18T00:00:00.000Z"),
    status: "required", createdBy: "user-1", createdAt: now, updatedAt: now
  };
}

function post(body: unknown) {
  return new Request("https://pgs.local/api/projects/project-1/procurement/request-1/workflow", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  }) as Parameters<typeof POST>[0];
}

const context = { params: { projectId: "project-1", requestId: "request-1" } };

describe("procurement request workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue({ user: { id: "user-1", name: "Admin", email: "admin@example.test", role: "ADMIN" }, project: { id: "project-1", organizationId: "org-1" } });
    mocks.effectiveRole.mockResolvedValue("ADMIN");
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue({});
    const tx = {
      procurementRequest: { updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUniqueOrThrow, findFirstOrThrow: mocks.findFirstOrThrow, update: mocks.requestUpdate },
      procurementRequestItem: { update: mocks.itemUpdate, findMany: mocks.itemFindMany },
      material: { findFirst: mocks.materialFindFirst, update: mocks.materialUpdate },
      auditLog: { create: vi.fn() },
      $queryRaw: mocks.queryRaw
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("checks project edit access before parsing or mutating", async () => {
    mocks.requireAccess.mockResolvedValue({ response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) });
    const response = (await POST(post({ action: "submit" }), context))!;
    expect(response.status).toBe(403);
    expect(mocks.requestFindFirst).not.toHaveBeenCalled();
  });

  it("moves a draft to user confirmation", async () => {
    mocks.requestFindFirst.mockResolvedValue(requestRecord("draft"));
    mocks.findUniqueOrThrow.mockResolvedValue({ ...requestRecord("submitted"), submittedAt: now });
    const response = (await POST(post({ action: "submit" }), context))!;
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "draft" }), data: expect.objectContaining({ status: "submitted" }) }));
  });

  it("requires an owner or admin to approve and moves ordered quantity", async () => {
    mocks.requestFindFirst.mockResolvedValue(requestRecord("submitted"));
    mocks.materialFindFirst.mockResolvedValue(materialRecord());
    mocks.materialUpdate.mockResolvedValue(materialRecord(0, 100));
    mocks.findUniqueOrThrow.mockResolvedValue({ ...requestRecord("expected"), expectedAt: new Date("2026-09-17T00:00:00.000Z") });
    const response = (await POST(post({ action: "approve", expectedAt: "2026-09-17" }), context))!;
    expect(response.status).toBe(200);
    expect(mocks.materialUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "in_transit" }) }));

    mocks.effectiveRole.mockResolvedValue("MANAGER");
    const forbidden = (await POST(post({ action: "approve", expectedAt: "2026-09-17" }), context))!;
    expect(forbidden.status).toBe(403);
  });

  it("records a partial receipt and increments warehouse delivery quantity", async () => {
    mocks.requestFindFirst.mockResolvedValue(requestRecord("expected"));
    mocks.findFirstOrThrow.mockResolvedValue(requestRecord("expected"));
    mocks.materialFindFirst.mockResolvedValue(materialRecord(0, 100));
    mocks.materialUpdate.mockResolvedValue(materialRecord(40, 100));
    mocks.itemFindMany.mockResolvedValue(requestRecord("partially_received", 40).items);
    mocks.requestUpdate.mockResolvedValue(requestRecord("partially_received", 40));
    const response = (await POST(post({ action: "receive", items: [{ itemId: "line-1", qty: 40 }] }), context))!;
    expect(response.status).toBe(200);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.itemUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { receivedQty: { increment: expect.any(Prisma.Decimal) } } }));
    expect(mocks.requestUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "partially_received" }) }));
  });
});
