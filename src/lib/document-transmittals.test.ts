import { describe, expect, it } from "vitest";
import { buildTransmittalManifest, resolveTransmittalTransition, transmittalSummary, TransmittalConflictError } from "./document-transmittals";

describe("document transmittal workflow", () => {
  it("allows only controlled workflow transitions", () => {
    expect(resolveTransmittalTransition("draft", "issue")).toBe("issued");
    expect(resolveTransmittalTransition("issued", "acknowledge")).toBe("acknowledged");
    expect(resolveTransmittalTransition("acknowledged", "review", "revise_required")).toBe("revise_required");
    expect(resolveTransmittalTransition("revise_required", "reissue")).toBe("issued");
    expect(resolveTransmittalTransition("issued", "review", "approved")).toBe("approved");
    expect(resolveTransmittalTransition("approved", "close")).toBe("closed");
    expect(() => resolveTransmittalTransition("draft", "close")).toThrow(TransmittalConflictError);
  });

  it("does not report missing data as green", () => {
    expect(transmittalSummary([])).toEqual({ total: 0, active: 0, overdue: 0, approved: 0, revisionsRequired: 0 });
    const summary = transmittalSummary([{ status: "issued", dueAt: new Date("2026-01-01T00:00:00Z") }], new Date("2026-02-01T00:00:00Z"));
    expect(summary.overdue).toBe(1);
    expect(summary.approved).toBe(0);
  });

  it("builds a versioned package manifest", () => {
    const manifest = buildTransmittalManifest({
      id: "tr-1", projectId: "project-1", number: "TR-001", sequence: 1, subject: "Исполнительная документация", purpose: "На согласование",
      recipient: "Заказчик", ccRecipients: "Технадзор", reviewer: "Иванов", dueAt: "2026-07-20T12:00:00.000Z", status: "issued", revision: 1,
      issuedAt: "2026-07-15T12:00:00.000Z", acknowledgedAt: null, reviewedAt: null, closedAt: null,
      items: [{ id: "item-1", documentId: "doc-1", documentVersionId: "v2", documentVersion: 2, titleSnapshot: "Акт скрытых работ", fileNameSnapshot: "act.pdf", categorySnapshot: "исполнительная" }],
      events: [{ id: "event-1", revision: 1, eventType: "issued", decision: null, comment: "Повторная выдача", createdByName: "РП", createdAt: "2026-07-15T12:00:00.000Z" }],
      createdAt: "2026-07-14T12:00:00.000Z", updatedAt: "2026-07-15T12:00:00.000Z"
    });
    expect(manifest).toContain("TR-001 · Rev 1");
    expect(manifest).toContain("Акт скрытых работ · v2 · act.pdf");
    expect(manifest).toContain("Повторная выдача");
  });
});
