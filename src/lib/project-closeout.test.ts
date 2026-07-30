import { describe, expect, it } from "vitest";
import {
  buildCloseoutBootstrapChecklist,
  canTransitionCloseoutPackage,
  canTransitionWarranty,
  closeoutMutationSchema,
  effectiveWarrantyStatus,
  summarizeProjectCloseout
} from "@/lib/project-closeout";

describe("project closeout model", () => {
  it("finds document candidates without silently completing the closeout checklist", () => {
    const items = buildCloseoutBootstrapChecklist([
      { id: "doc-contract", title: "Договор подряда", category: "договор", fileName: "contract.pdf" },
      { id: "doc-asbuilt", title: "Исполнительная схема сети", category: "исполнительная", fileName: "scheme.pdf" }
    ], 1);

    expect(items.find((item) => item.title.includes("Договор"))).toMatchObject({
      documentId: "doc-contract",
      status: "in_progress"
    });
    expect(items.find((item) => item.title.includes("Исполнительные схемы"))).toMatchObject({
      documentId: "doc-asbuilt",
      status: "in_progress"
    });
    expect(items.find((item) => item.sourceType === "quality_gate")).toMatchObject({ status: "blocked" });
    expect(items.some((item) => item.status === "completed")).toBe(false);
  });

  it("does not allow a false closeout green while quality or checklist blockers remain", () => {
    const summary = summarizeProjectCloseout({
      projectStatus: "active",
      openAcceptanceBlockers: 2,
      packages: [{
        status: "accepted",
        dueAt: null,
        checklistItems: [
          { required: true, status: "completed", sourceType: "document_requirement" },
          { required: true, status: "completed", sourceType: "quality_gate" }
        ]
      }],
      warranties: []
    });

    expect(summary.readiness).toBe("blocked");
    expect(summary.blockedItemCount).toBe(1);
    expect(summary.canCompleteProject).toBe(false);
  });

  it("marks the project ready only when every required item and package is accepted", () => {
    const summary = summarizeProjectCloseout({
      projectStatus: "active",
      openAcceptanceBlockers: 0,
      packages: [{
        status: "accepted",
        dueAt: null,
        checklistItems: [
          { required: true, status: "completed", sourceType: "document_requirement" },
          { required: true, status: "not_applicable", sourceType: "manual" }
        ]
      }],
      warranties: []
    });

    expect(summary).toMatchObject({
      readiness: "ready",
      completionPercent: 100,
      remainingItemCount: 0,
      canCompleteProject: true
    });
  });

  it("surfaces expiring warranties and unreleased retention", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const warranty = {
      status: "active",
      endsAt: "2026-08-10T12:00:00.000Z",
      retentionAmount: "175000",
      retentionReleaseAt: "2026-08-15T12:00:00.000Z"
    };
    expect(effectiveWarrantyStatus(warranty, now)).toBe("expiring");
    const summary = summarizeProjectCloseout({
      projectStatus: "completed",
      openAcceptanceBlockers: 0,
      packages: [{ status: "closed", checklistItems: [{ required: true, status: "completed", sourceType: "manual" }] }],
      warranties: [warranty],
      now
    });
    expect(summary).toMatchObject({ readiness: "warranty", activeWarrantyCount: 1, expiringWarrantyCount: 1, retentionHeld: 175000 });
  });

  it("enforces explicit lifecycle transitions and strict mutation payloads", () => {
    expect(canTransitionCloseoutPackage("in_progress", "submitted")).toBe(true);
    expect(canTransitionCloseoutPackage("draft", "accepted")).toBe(false);
    expect(canTransitionWarranty("draft", "active")).toBe(true);
    expect(canTransitionWarranty("closed", "active")).toBe(false);
    expect(closeoutMutationSchema.parse({ action: "complete_project" })).toEqual({ action: "complete_project" });
    expect(() => closeoutMutationSchema.parse({ action: "bootstrap", secret: "leak" })).toThrow();
  });
});
