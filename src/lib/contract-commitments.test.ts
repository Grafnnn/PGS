import { describe, expect, it } from "vitest";
import {
  commitmentSummary,
  expectedPaymentDirection,
  normalizeCommitmentLine,
  resolveCommitmentTransition,
  resolvePaymentApplicationTransition,
  serializeCommitment,
  validatePaymentApplicationLines
} from "./contract-commitments";

const now = new Date("2026-07-18T10:00:00.000Z");

function commitment(status = "active") {
  return {
    id: "commitment-1",
    organizationId: "org-1",
    projectId: "project-1",
    sequence: 1,
    number: "COM-001",
    type: "subcontract",
    title: "Монолитные работы",
    counterparty: "ООО Монолит",
    externalNumber: "SUB-17",
    status,
    currency: "RUB",
    retentionPercent: 10,
    paymentTerms: "30 дней",
    startsAt: now,
    endsAt: now,
    sourceProcurementRequestId: null,
    linkedDocumentId: null,
    linkedDocumentVersion: null,
    linkedDocumentVersionId: null,
    approvalWorkflowRunId: null,
    decisionComment: null,
    submittedAt: now,
    approvedAt: now,
    activatedAt: now,
    completedAt: null,
    terminatedAt: null,
    rejectedAt: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
    lines: [{ id: "line-1", budgetItemId: null, costCodeId: "cc-1", sourceProcurementRequestItemId: null, sequence: 1, code: "01.01", description: "Бетонирование", quantity: 10, unit: "м3", unitPrice: 10_000, scheduledValue: 100_000 }],
    changeOrders: [{ id: "co-1", number: "CHG-001", title: "Доп. объём", status: "approved", approvedAmount: 20_000, committedAmount: 0 }],
    paymentApplications: [{
      id: "app-1",
      projectId: "project-1",
      commitmentId: "commitment-1",
      paymentId: null,
      sequence: 1,
      number: "APP-001",
      periodStart: now,
      periodEnd: now,
      status: "approved",
      currentAmount: 30_000,
      materialsStored: 0,
      retentionAmount: 3_000,
      netAmount: 27_000,
      notes: null,
      decisionComment: null,
      submittedAt: now,
      approvedAt: now,
      rejectedAt: null,
      paidAt: null,
      voidedAt: null,
      createdAt: now,
      updatedAt: now,
      lines: [{ id: "app-line-1", commitmentLineId: "line-1", previousAmount: 0, currentAmount: 30_000, materialsStored: 0, retentionAmount: 3_000 }]
    }]
  } as any;
}

describe("contract commitments", () => {
  it("derives revised value, certified amount, retention and remaining value", () => {
    const result = serializeCommitment(commitment());
    expect(result.values).toEqual({
      original: 100_000,
      approvedChanges: 20_000,
      revised: 120_000,
      approvedApplications: 30_000,
      paid: 0,
      retentionHeld: 3_000,
      remaining: 90_000
    });
  });

  it("does not count unapproved drafts as committed value", () => {
    const result = commitmentSummary([commitment("draft")]);
    expect(result).toMatchObject({ total: 1, active: 0, revisedValue: 0, remaining: 0 });
  });

  it("computes a line value unless an explicit SOV value is supplied", () => {
    expect(normalizeCommitmentLine({ description: "Работы", quantity: 3, unit: "шт", unitPrice: 125, scheduledValue: undefined, budgetItemId: "", costCodeId: "", sourceProcurementRequestItemId: "", code: "" }).scheduledValue).toBe(375);
    expect(normalizeCommitmentLine({ description: "Работы", quantity: 3, unit: "шт", unitPrice: 125, scheduledValue: 500, budgetItemId: "", costCodeId: "", sourceProcurementRequestItemId: "", code: "" }).scheduledValue).toBe(500);
  });

  it("enforces lifecycle transitions", () => {
    expect(resolveCommitmentTransition("draft", "submit")).toBe("submitted");
    expect(resolveCommitmentTransition("approved", "activate")).toBe("active");
    expect(() => resolveCommitmentTransition("draft", "complete")).toThrow(/not allowed/);
    expect(resolvePaymentApplicationTransition("approved", "mark_paid")).toBe("paid");
  });

  it("blocks SOV overbilling and calculates retention from approved history", () => {
    const base = {
      retentionPercent: 10,
      lines: [{ id: "line-1", scheduledValue: 100_000 }],
      paymentApplications: [{ status: "approved", lines: [{ commitmentLineId: "line-1", currentAmount: 30_000, materialsStored: 0 }] }]
    };
    const valid = validatePaymentApplicationLines(base, [{ commitmentLineId: "line-1", currentAmount: 60_000, materialsStored: 0 }]);
    expect(valid).toMatchObject({ error: "", lines: [{ previousAmount: 30_000, retentionAmount: 6_000 }] });
    expect(validatePaymentApplicationLines(base, [{ commitmentLineId: "line-1", currentAmount: 80_000, materialsStored: 0 }]).error).toMatch(/exceeds/);
  });

  it("maps customer contracts to incoming payments only", () => {
    expect(expectedPaymentDirection("owner_contract")).toBe("incoming");
    expect(expectedPaymentDirection("subcontract")).toBe("outgoing");
  });
});
