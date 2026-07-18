import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "owner-1", name: "Владелец", email: "owner@example.test", role: "OWNER", authenticated: true })) }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: vi.fn(async () => "OWNER") }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  projectPaymentApplication: { findFirst: vi.fn() },
  payment: { findFirst: vi.fn() },
  $transaction: vi.fn()
} }));

const now = new Date("2026-07-18T10:00:00.000Z");
const current = {
  id: "app-1",
  organizationId: "org-1",
  projectId: "project-1",
  commitmentId: "commitment-1",
  paymentId: null,
  sequence: 1,
  number: "APP-001",
  periodStart: now,
  periodEnd: now,
  status: "approved",
  currentAmount: 100,
  materialsStored: 0,
  retentionAmount: 10,
  netAmount: 90,
  notes: null,
  decisionComment: null,
  submittedAt: now,
  approvedAt: now,
  rejectedAt: null,
  paidAt: null,
  voidedAt: null,
  createdAt: now,
  updatedAt: now,
  lines: [],
  payment: null,
  commitment: { type: "subcontract", number: "COM-001" }
};

function request(body: unknown) {
  return new Request("https://pgs.local", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
}

const params = { projectId: "project-1", commitmentId: "commitment-1", applicationId: "app-1" };

describe("payment application action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("OWNER");
    vi.mocked(prisma.projectPaymentApplication.findFirst).mockResolvedValue(current as never);
  });

  it("checks project role before parsing the action body", async () => {
    vi.mocked(getEffectiveProjectRole).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", body: "not-json" }) as never, { params });
    expect(response.status).toBe(403);
    expect(prisma.projectPaymentApplication.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an incoming payment for a subcontract application", async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({ id: "payment-1", title: "Аванс заказчика", status: "paid", amount: 500, direction: "incoming" } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "mark_paid", paymentId: "payment-1" }), { params });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Payment direction does not match commitment type" });
  });

  it("does not delete an approved application", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("https://pgs.local", { method: "DELETE" }), { params });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Only a draft application can be deleted" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
