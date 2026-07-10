import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PhotoEvidenceWorkspace } from "@/components/photo-evidence-workspace";
import { getProjectBundle } from "@/lib/demo-data";
import type { ProjectDocument } from "@/lib/types";

describe("PhotoEvidenceWorkspace", () => {
  it("renders evidence workspace markers without uploads or provider calls", () => {
    const bundle = getProjectBundle("project-smoke");
    const documents: ProjectDocument[] = [
      {
        id: "doc-photo",
        projectId: bundle.project.id,
        category: "Фотофиксация",
        title: "Фото готового объема",
        filePath: "/uploads/photo.jpg",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        previewAvailable: true,
        version: 1,
        author: "ПТО",
        createdAt: "2026-07-09T10:00:00.000Z"
      }
    ];

    const html = renderToStaticMarkup(
      createElement(PhotoEvidenceWorkspace, {
        project: bundle.project,
        budgetItems: bundle.budgetItems,
        scheduleItems: bundle.scheduleItems,
        materials: bundle.materials,
        procurementRequests: bundle.procurementRequests,
        payments: bundle.payments,
        dailyReports: bundle.dailyReports,
        risks: bundle.risks,
        documents,
        documentChecklist: [],
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("Photo &amp; Evidence Capture");
    expect(html).toContain("Фотофиксация / Evidence");
    expect(html).toContain("Evidence register");
    expect(html).toContain("Evidence actions");
    expect(html).toContain("Evidence handoff");
    expect(html).toContain("Ограничения v1");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
