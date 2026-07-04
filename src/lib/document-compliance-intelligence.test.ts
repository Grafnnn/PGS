import { describe, expect, it } from "vitest";
import {
  buildCloseoutReadiness,
  buildDocumentComplianceIntelligence,
  buildDocumentComplianceRisks,
  buildExecutiveDocumentPackage,
  buildRequiredDocumentChecklist,
  buildWeeklyDocumentCollectionPlan,
  buildWorkPackageDocumentMap,
  classifyRequiredDocumentForWorkPackage,
  type RiskExecutiveImportHistoryItem
} from "@/lib/document-compliance-intelligence";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, ScheduleItem } from "@/lib/types";

const project: Partial<Project> = {
  id: "project-smoke",
  name: "Smoke object",
  contractAmount: 50_000_000,
  startsAt: "2026-07-01",
  endsAt: "2026-10-01"
};

const budgetItems: BudgetItem[] = [
  {
    id: "b-structure",
    projectId: "project-smoke",
    section: "Монолитные работы",
    code: "2.1",
    name: "Бетонирование плиты",
    unit: "м3",
    qty: 0,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    forecastUnitPrice: 6200,
    kind: "work",
    source: "test"
  },
  {
    id: "b-network",
    projectId: "project-smoke",
    section: "Наружные сети",
    code: "3.1",
    name: "Монтаж трубы ПНД",
    unit: "м",
    qty: 120,
    plannedUnitPrice: 0,
    actualUnitPrice: 0,
    forecastUnitPrice: 0,
    kind: "work",
    source: "test"
  },
  {
    id: "b-material",
    projectId: "project-smoke",
    section: "Материалы",
    code: "4.1",
    name: "Арматура А500С",
    unit: "т",
    qty: 10,
    plannedUnitPrice: 72000,
    actualUnitPrice: 0,
    forecastUnitPrice: 72000,
    kind: "material",
    source: "test"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "s-structure",
    projectId: "project-smoke",
    budgetItemId: "b-structure",
    name: "Монолит плиты",
    owner: "РП",
    startsAt: "2026-07-01",
    endsAt: "2026-07-07",
    plannedQty: 100,
    actualQty: 20,
    status: "delayed"
  },
  {
    id: "s-network",
    projectId: "project-smoke",
    budgetItemId: "b-network",
    name: "Наружные сети ПНД",
    owner: "ПТО",
    startsAt: "2026-07-08",
    endsAt: "2026-07-14",
    plannedQty: 120,
    actualQty: 0,
    status: "not_started"
  }
];

const materials: Material[] = [
  {
    id: "m-rebar",
    projectId: "project-smoke",
    name: "Арматура А500С",
    unit: "т",
    requiredQty: 10,
    orderedQty: 4,
    deliveredQty: 0,
    consumedQty: 0,
    plannedUnitPrice: 72000,
    actualUnitPrice: 0,
    supplier: "Металл",
    neededAt: "2026-07-02",
    status: "ordered"
  }
];

const procurementRequests: ProcurementRequest[] = [
  {
    id: "pr-1",
    projectId: "project-smoke",
    title: "Арматура на плиту",
    initiator: "Прораб",
    neededAt: "2026-07-02",
    priority: "critical",
    status: "submitted",
    items: [{ materialId: "m-rebar", name: "Арматура А500С", qty: 6, unit: "т" }]
  }
];

const documents: ProjectDocument[] = [
  {
    id: "doc-contract",
    projectId: "project-smoke",
    category: "договор",
    title: "Договор подряда",
    filePath: "/dev/null",
    fileName: "contract.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01T00:00:00.000Z"
  },
  {
    id: "doc-vor",
    projectId: "project-smoke",
    category: "вор",
    title: "ВОР / смета",
    filePath: "/dev/null",
    fileName: "vor.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 2000,
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01T00:00:00.000Z"
  }
];

const importHistory: RiskExecutiveImportHistoryItem[] = [
  {
    id: "batch-1",
    fileName: "vor.xlsx",
    status: "committed",
    committedAt: "2026-07-01T00:00:00.000Z",
    preview: {
      summary: {
        totalRows: 3,
        parsedRows: 2,
        readyRows: 1,
        warningRows: 1,
        errorRows: 0,
        skippedRows: 0,
        ignoredRows: 0,
        sections: 1,
        budgetItems: 1,
        materials: 1,
        scheduleItems: 0,
        workRows: 1,
        materialRows: 1,
        unknownRows: 1,
        duplicateRows: 0,
        hiddenRows: 0,
        formulaCells: 0,
        errors: 0,
        warnings: 1
      },
      unknownRows: [{ sheetName: "ВОР", rowNumber: 12, reason: "unknown", values: ["???"] }],
      previewRows: []
    }
  }
];

describe("document compliance intelligence", () => {
  it("handles empty/null project without false ready state", () => {
    const model = buildDocumentComplianceIntelligence({ project: { id: "empty" } });

    expect(model.summary.readiness).toBe("no_data");
    expect(model.summary.missingSources).toEqual(expect.arrayContaining(["ВОР", "Schedule", "Materials", "Project"]));
    expect(model.executivePackage.readiness).toBe("no_data");
    expect(model.complianceRisks.some((risk) => risk.id === "documents:no-data")).toBe(true);
  });

  it("creates required document checklist from imported VOR and preserves uploaded documents", () => {
    const docs = buildRequiredDocumentChecklist({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory });

    expect(docs.some((doc) => doc.title.includes("Акт освидетельствования скрытых работ"))).toBe(true);
    expect(docs.some((doc) => doc.title.includes("Исполнительная схема"))).toBe(true);
    expect(docs.some((doc) => doc.title.includes("Паспорт/сертификат материала"))).toBe(true);
    expect(docs.find((doc) => doc.id === "project:contract")?.status).toBe("uploaded");
    expect(docs.find((doc) => doc.id === "project:vor")?.status).toBe("uploaded");
    expect(docs.some((doc) => doc.id === "import:unknown-document-classification" && doc.status === "unknown")).toBe(true);
  });

  it("maps work packages to conservative document requirements", () => {
    expect(classifyRequiredDocumentForWorkPackage({ id: "a", name: "Монолит плиты" })).toBe("structure");
    expect(classifyRequiredDocumentForWorkPackage({ id: "b", name: "Монтаж трубы ПНД" })).toBe("engineering");

    const docs = buildRequiredDocumentChecklist({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory });
    const map = buildWorkPackageDocumentMap({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory }, docs);

    expect(map.find((item) => item.id === "s-structure")?.blockingDocs.join(" ")).toContain("скрытых");
    expect(map.find((item) => item.id === "s-network")?.blockingDocs.join(" ")).toContain("Исполнительная схема");
    expect(map.every((item) => item.requiredDocsCount > 0)).toBe(true);
  });

  it("uses procurement/material data for certificates and incoming inspection requirements", () => {
    const model = buildDocumentComplianceIntelligence({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory });

    expect(model.requiredDocuments.some((doc) => doc.title.includes("Паспорт/сертификат материала: Арматура"))).toBe(true);
    expect(model.requiredDocuments.some((doc) => doc.title.includes("Входной контроль материала"))).toBe(true);
    expect(model.weeklyPlan.some((action) => action.ownerRole === "procurement")).toBe(true);
  });

  it("blocks KS/closeout readiness on missing documents and missing quantities/prices", () => {
    const docs = buildRequiredDocumentChecklist({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory });
    const closeout = buildCloseoutReadiness({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory }, docs);

    expect(closeout.readyForKs).toBe("no");
    expect(closeout.blockingDocuments.length).toBeGreaterThan(0);
    expect(closeout.missingPricesOrQuantities.map((item) => item.reason)).toEqual(expect.arrayContaining(["missing quantity", "missing price"]));
    expect(closeout.requiredReportPackage).toContain("ВОР/смета");
  });

  it("builds executive package and weekly collection plan with explicit limitations", () => {
    const docs = buildRequiredDocumentChecklist({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory });
    const closeout = buildCloseoutReadiness({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory }, docs);
    const pkg = buildExecutiveDocumentPackage({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory }, docs, closeout);
    const plan = buildWeeklyDocumentCollectionPlan(docs, buildWorkPackageDocumentMap({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory }, docs));

    expect(pkg.readiness).toBe("blocked");
    expect(pkg.customerSubmissionChecklist).toContain("risk register snapshot");
    expect(pkg.limitations.join(" ")).toContain("операционный checklist");
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0].title).not.toContain("undefined");
  });

  it("creates compliance risks without inventing signatories or acceptance dates", () => {
    const risks = buildDocumentComplianceRisks({ project, budgetItems, scheduleItems, materials, procurementRequests, documents, importHistory });
    const text = risks.map((risk) => `${risk.title} ${risk.description} ${risk.evidence.join(" ")}`).join(" ");

    expect(risks.some((risk) => risk.id === "documents:ks-blocked")).toBe(true);
    expect(text).not.toMatch(/Иван|Петров|подписал 20|acceptance date/i);
    expect(text).not.toContain("DATABASE_URL");
  });
});
