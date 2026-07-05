import React, { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContractTenderWorkspace } from "@/components/contract-tender-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("ContractTenderWorkspace", () => {
  it("renders contract terms, required documents and management memo without provider calls", () => {
    const bundle = getProjectBundle("project-demo");
    const html = renderToStaticMarkup(
      createElement(ContractTenderWorkspace, {
        project: bundle.project,
        budgetItems: bundle.budgetItems,
        scheduleItems: bundle.scheduleItems,
        materials: bundle.materials,
        procurementRequests: bundle.procurementRequests,
        payments: bundle.payments,
        risks: bundle.risks,
        documents: [
          {
            id: "doc-1",
            projectId: bundle.project.id,
            category: "договор",
            title: "Договор подряда",
            filePath: "/safe/contract.pdf",
            version: 1,
            author: "ПТО",
            createdAt: "2026-07-01"
          }
        ],
        documentChecklist: [
          { key: "contract", title: "Договор", status: "present", categoryHints: ["договор"], documentIds: ["doc-1"], evidence: [], suggestedNextStep: "Проверить" },
          { key: "payment", title: "График оплат", status: "missing", categoryHints: ["оплата"], documentIds: [], evidence: [], suggestedNextStep: "Запросить" }
        ],
        onNavigate: () => undefined
      })
    );

    expect(html).toContain("Contract &amp; Tender Intelligence");
    expect(html).toContain("Договор / тендер / КП");
    expect(html).toContain("Ключевые условия");
    expect(html).toContain("Пакет документов");
    expect(html).toContain("Управленческая записка");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
