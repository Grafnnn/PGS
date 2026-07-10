import { describe, expect, it } from "vitest";
import { buildPhotoEvidenceIntelligence } from "@/lib/photo-evidence-intelligence";
import type { ProjectDocument, ScheduleItem } from "@/lib/types";

const scheduleItem: ScheduleItem = {
  id: "schedule-1",
  projectId: "project",
  name: "Монолитные работы секции А",
  owner: "ПТО",
  startsAt: "2026-07-01",
  endsAt: "2026-07-08",
  plannedQty: 100,
  actualQty: 60,
  status: "in_progress"
};

const photoDocument: ProjectDocument = {
  id: "doc-photo",
  projectId: "project",
  category: "Фотофиксация",
  title: "Фото монолитные работы секции А",
  filePath: "/uploads/photo.jpg",
  fileName: "photo-monolit-a.jpg",
  mimeType: "image/jpeg",
  previewAvailable: true,
  version: 1,
  author: "ПТО",
  createdAt: "2026-07-09T10:00:00.000Z"
};

describe("photo evidence intelligence", () => {
  it("keeps an empty project as no evidence instead of false green", () => {
    const model = buildPhotoEvidenceIntelligence({ project: { id: "empty" } });

    expect(model.summary.status).toBe("no_evidence");
    expect(model.summary.tone).toBe("info");
    expect(model.summary.evidenceDocuments).toBe(0);
    expect(model.summary.nextStep).toContain("Загрузить фотофиксацию");
    expect(model.handoff.copyText).not.toContain("DATABASE_URL");
    expect(model.handoff.copyText).not.toContain("OPENAI_API_KEY");
  });

  it("links photo documents to schedule facts and surfaces KS blockers", () => {
    const model = buildPhotoEvidenceIntelligence({
      project: { id: "project", name: "Smoke project" },
      scheduleItems: [scheduleItem],
      documents: [photoDocument],
      dailyReports: [
        {
          id: "report-1",
          projectId: "project",
          date: "2026-07-09",
          author: "Инженер",
          weather: "ясно",
          workers: 8,
          engineers: 1,
          equipment: "кран",
          completedWorks: "Выполнены монолитные работы, фотофиксация приложена.",
          materialsReceived: "",
          materialsConsumed: "",
          downtime: "",
          issues: "",
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
          suggestedNextStep: "Приложить акт и фотофиксацию перед КС."
        }
      ]
    });

    expect(model.summary.status).toBe("blocked");
    expect(model.summary.photoDocuments).toBe(1);
    expect(model.summary.evidenceDocuments).toBe(1);
    expect(model.summary.reportEvidence).toBe(1);
    expect(model.summary.linkedScheduleItems).toBe(1);
    expect(model.summary.ksBlockers).toBeGreaterThan(0);
    expect(model.items.some((item) => item.category === "checklist" && item.status === "missing")).toBe(true);
    expect(model.actions.some((action) => action.targetTab === "КС" && action.priority === "high")).toBe(true);
  });
});
