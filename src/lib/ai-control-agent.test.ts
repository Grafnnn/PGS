import { describe, expect, it } from "vitest";
import { buildAiControlAgentPreview, withAiControlPreviewId } from "@/lib/ai-control-agent";
import { getProjectBundle } from "@/lib/demo-data";

describe("AI Control Agent v2", () => {
  it("builds a deterministic read-only preview from project evidence", () => {
    const bundle = getProjectBundle("project-demo");
    const generatedAt = new Date("2026-07-27T09:00:00.000Z");
    const input = {
      project: bundle.project,
      budgetItems: bundle.budgetItems,
      scheduleItems: [{ ...bundle.scheduleItems[0], id: "schedule-delay", name: "Монолит", status: "delayed" as const }],
      materials: [{ ...bundle.materials[0], id: "material-gap", name: "Арматура", requiredQty: 100, orderedQty: 30 }],
      payments: bundle.payments,
      dailyReports: [],
      risks: bundle.risks,
      actionItems: [],
      documentCount: 0,
      workforce: { overloaded: 1, shortageHours: 80, certificationGaps: 2, headcount: 8, equipment: 1 }
    };
    const first = withAiControlPreviewId(buildAiControlAgentPreview(input, generatedAt));
    const second = withAiControlPreviewId(buildAiControlAgentPreview(input, generatedAt));
    expect(first.previewId).toBe(second.previewId);
    expect(first.proposals.map((item) => item.sourceKey)).toEqual(expect.arrayContaining([
      "schedule:schedule-delay",
      "material:material-gap",
      "reports:freshness",
      "workforce:capacity",
      "workforce:certifications",
      "documents:missing"
    ]));
    expect(first.mutationPolicy).toEqual({
      previewWrites: false,
      confirmWrites: "project_actions_only",
      budgetScheduleProcurementDocumentWrites: false
    });
  });

  it("does not offer an action that is already active", () => {
    const bundle = getProjectBundle("project-demo");
    const preview = buildAiControlAgentPreview({
      project: bundle.project,
      budgetItems: bundle.budgetItems,
      scheduleItems: [],
      materials: [],
      payments: [],
      dailyReports: [],
      risks: [],
      actionItems: [{ title: "Обновить рапорт стройплощадки", sourceModule: "AI Control Agent", status: "open" }],
      documentCount: 1,
      workforce: { overloaded: 0, shortageHours: 0, certificationGaps: 0, headcount: 0, equipment: 0 }
    }, new Date("2026-07-27T09:00:00.000Z"));
    expect(preview.proposals.some((item) => item.title === "Обновить рапорт стройплощадки")).toBe(false);
    expect(preview.skippedExisting).toBe(1);
  });
});
