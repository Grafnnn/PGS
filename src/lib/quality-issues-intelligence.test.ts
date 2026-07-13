import { describe, expect, it } from "vitest";
import { buildQualityIssuesIntelligence } from "@/lib/quality-issues-intelligence";
import type { ProjectDocument, ScheduleItem } from "@/lib/types";

const delayedWork: ScheduleItem = {
  id: "schedule-1",
  projectId: "project",
  name: "Монтаж инженерных сетей",
  owner: "ПТО",
  startsAt: "2026-07-01",
  endsAt: "2026-07-08",
  plannedQty: 100,
  actualQty: 45,
  status: "delayed"
};

const evidenceDocument: ProjectDocument = {
  id: "evidence-1",
  projectId: "project",
  category: "Фотофиксация",
  title: "Акт устранения замечаний по сетям",
  filePath: "/uploads/evidence.jpg",
  fileName: "quality-evidence.jpg",
  mimeType: "image/jpeg",
  previewAvailable: true,
  version: 1,
  author: "ПТО",
  createdAt: "2026-07-12T10:00:00.000Z"
};

describe("quality issues intelligence", () => {
  it("keeps an empty project informational instead of reporting false green", () => {
    const model = buildQualityIssuesIntelligence({ project: { id: "empty" } });

    expect(model.summary.status).toBe("no_data");
    expect(model.summary.tone).toBe("info");
    expect(model.summary.totalIssues).toBe(0);
    expect(model.summary.nextStep).toContain("Добавьте рапорт");
    expect(model.handoff.copyText).not.toContain("DATABASE_URL");
    expect(model.handoff.copyText).not.toContain("OPENAI_API_KEY");
  });

  it("collects report, schedule, KS and evidence signals into a deterministic punch list", () => {
    const model = buildQualityIssuesIntelligence({
      project: { id: "project", name: "Smoke project" },
      scheduleItems: [delayedWork],
      documents: [evidenceDocument],
      dailyReports: [
        {
          id: "report-1",
          projectId: "project",
          date: "2026-07-12",
          author: "Прораб",
          weather: "ясно",
          workers: 10,
          engineers: 1,
          equipment: "подъемник",
          completedWorks: "Монтаж сетей",
          materialsReceived: "",
          materialsConsumed: "",
          downtime: "",
          issues: "Замечание технадзора: устранить дефект изоляции.",
          status: "submitted"
        }
      ],
      documentChecklist: [
        {
          key: "hidden-works",
          title: "Акт скрытых работ",
          status: "missing",
          categoryHints: ["исполнительная"],
          documentIds: [],
          evidence: [],
          suggestedNextStep: "Приложить акт перед КС."
        }
      ]
    });

    expect(model.summary.status).toBe("blocked");
    expect(model.summary.totalIssues).toBeGreaterThanOrEqual(3);
    expect(model.summary.reportIssues).toBe(1);
    expect(model.summary.evidenceDocuments).toBe(1);
    expect(model.summary.acceptanceBlockers).toBe(1);
    expect(model.issues.some((item) => item.source === "Ежедневный рапорт")).toBe(true);
    expect(model.actions.some((item) => item.targetTab === "КС" && item.priority === "high")).toBe(true);
  });
});
