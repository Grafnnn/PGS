import { describe, expect, it } from "vitest";
import { buildInvoiceReconciliation, invoiceReconcileSchema } from "@/lib/invoice-reconciliation";

describe("invoice reconciliation", () => {
  it("matches a documented invoice against its commitment and paid payment", () => {
    const result = buildInvoiceReconciliation({
      direction: "AP",
      counterparty: "ООО Монолит",
      grossAmount: 100,
      linkedDocumentId: "doc-1",
      commitment: { counterparty: "ООО Монолит", status: "active", lines: [{ scheduledValue: 100 }] },
      payment: { direction: "outgoing", status: "paid", amount: 100 }
    });
    expect(result.matchStatus).toBe("matched");
    expect(result.checks.some((check) => check.status === "blocked")).toBe(false);
    expect(result.checks.some((check) => check.status === "variance")).toBe(false);
  });

  it("surfaces missing source and document instead of false green", () => {
    const result = buildInvoiceReconciliation({
      direction: "AR",
      counterparty: "Заказчик",
      grossAmount: 250
    });
    expect(result.matchStatus).toBe("blocked");
    expect(result.checks.filter((check) => check.status === "blocked")).toHaveLength(2);
  });

  it("reports amount and counterparty variance", () => {
    const result = buildInvoiceReconciliation({
      direction: "AP",
      counterparty: "ООО Альфа",
      grossAmount: 120,
      linkedDocumentId: "doc-1",
      commitment: { counterparty: "ООО Бета", status: "active", lines: [{ scheduledValue: 100 }] }
    });
    expect(result.matchStatus).toBe("variance");
    expect(result.amountVariance).toBe(20);
  });

  it("requires explicit reconciliation confirmation", () => {
    expect(invoiceReconcileSchema.safeParse({}).success).toBe(false);
    expect(invoiceReconcileSchema.safeParse({ confirmed: true }).success).toBe(true);
  });
});
