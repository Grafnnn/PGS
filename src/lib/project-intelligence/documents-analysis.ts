import type { ProjectDocument } from "@/lib/types";
import type { DocumentsIntelligence, IntelligenceIssue } from "./types";
import { action, daysBetween, evidence, issue, parseDate } from "./helpers";

const keyDocuments = [
  { type: "contract", title: "Договор", match: ["договор", "contract"], actionType: "missing_contract" },
  { type: "estimate", title: "Смета / ВОР", match: ["смет", "вор", "estimate"], actionType: "missing_estimate" },
  { type: "design", title: "Проектная документация", match: ["проект", "design"], actionType: "missing_design_doc" }
];

export function analyzeDocuments(documents: ProjectDocument[], now = new Date()): DocumentsIntelligence {
  const issues: IntelligenceIssue[] = [];
  const missingKeyDocuments = keyDocuments
    .filter((required) => !documents.some((document) => required.match.some((marker) => `${document.category} ${document.title}`.toLowerCase().includes(marker))))
    .map((required) =>
      issue({
        id: `documents-missing-${required.type}`,
        category: "documents",
        title: `Отсутствует документ: ${required.title}`,
        reason: `В реестре не найден ${required.title.toLowerCase()}.`,
        score: required.type === "contract" ? 75 : 55,
        suggestedAction: "Загрузите документ или уточните категорию существующего файла.",
        evidence: [
          evidence({
            entityType: "project",
            label: required.title,
            section: "documents",
            explanation: "Ключевой документ не найден по категории/названию."
          })
        ]
      })
    );
  issues.push(...missingKeyDocuments);

  const uncategorizedDocuments = documents.filter((document) => !document.category || document.category === "прочее");
  for (const document of uncategorizedDocuments) {
    issues.push(
      issue({
        id: `documents-uncategorized-${document.id}`,
        category: "documents",
        title: "Документ без точной категории",
        reason: `${document.title} находится в категории "${document.category || "-"}".`,
        score: 35,
        suggestedAction: "Уточните категорию, чтобы документ участвовал в проверках.",
        evidence: [
          evidence({
            entityType: "document",
            entityId: document.id,
            documentId: document.id,
            label: document.title,
            field: "category",
            value: document.category,
            explanation: "Категория нужна для будущего поиска и RAG."
          })
        ]
      })
    );
  }

  const staleDocuments = documents.filter((document) => {
    const uploadedAt = parseDate(document.uploadedAt ?? document.createdAt);
    return Boolean(uploadedAt && daysBetween(uploadedAt, now) > 180);
  });
  for (const document of staleDocuments.slice(0, 8)) {
    issues.push(
      issue({
        id: `documents-stale-${document.id}`,
        category: "documents",
        title: "Документ стоит перепроверить",
        reason: `${document.title} загружен более 180 дней назад.`,
        score: 32,
        suggestedAction: "Проверьте актуальность версии перед работами/закупками.",
        evidence: [
          evidence({
            entityType: "document",
            entityId: document.id,
            documentId: document.id,
            label: document.title,
            field: "uploadedAt",
            value: document.uploadedAt ?? document.createdAt,
            explanation: "Старые документы могут не отражать актуальные изменения."
          })
        ]
      })
    );
  }

  const reviewRecommendations = issues.map((item) =>
    action({
      id: `action-${item.id}`,
      category: "documents",
      actionType: item.id.includes("missing-contract")
        ? "missing_contract"
        : item.id.includes("missing-estimate")
          ? "missing_estimate"
          : item.id.includes("missing-design")
            ? "missing_design_doc"
            : item.id.includes("stale")
              ? "stale_document"
              : "document_review_needed",
      priority: item.level,
      title: item.title,
      description: item.reason,
      suggestedNextStep: item.suggestedAction,
      ownerRole: "ПТО",
      evidence: item.evidence,
      entityType: item.evidence[0]?.entityType ?? null,
      entityId: item.evidence[0]?.entityId ?? null
    })
  );

  return {
    missingKeyDocuments,
    uncategorizedDocuments,
    staleDocuments,
    reviewRecommendations,
    ragReadiness: {
      status: "placeholder",
      message: "RAG-поиск не включен в v1: документы анализируются только по метаданным."
    },
    issues
  };
}
