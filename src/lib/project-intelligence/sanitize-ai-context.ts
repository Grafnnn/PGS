import { redactTokenLikeValue } from "./helpers";
import type { ProjectIntelligenceSnapshot } from "./types";

export function sanitizeAiContext(snapshot: ProjectIntelligenceSnapshot) {
  const context = {
    project: {
      id: snapshot.project.id,
      name: snapshot.project.name,
      customer: snapshot.project.customer,
      status: snapshot.project.status,
      contractAmount: snapshot.project.contractAmount,
      startsAt: snapshot.project.startsAt,
      endsAt: snapshot.project.endsAt
    },
    executiveSummary: snapshot.executiveSummary,
    radar: snapshot.radar.map((item) => ({
      category: item.category,
      level: item.level,
      reason: item.shortReason,
      suggestedAction: item.suggestedAction,
      evidence: item.evidence.map((entry) => ({
        entityType: entry.entityType,
        label: entry.label,
        field: entry.field,
        value: entry.value,
        explanation: entry.explanation,
        documentId: entry.documentId,
        page: entry.page,
        section: entry.section,
        snippet: entry.snippet?.slice(0, 240)
      }))
    })),
    actions: snapshot.actions.slice(0, 12).map((item) => ({
      category: item.category,
      actionType: item.actionType,
      priority: item.priority,
      title: item.title,
      suggestedNextStep: item.suggestedNextStep,
      ownerRole: item.ownerRole,
      evidence: item.evidence.map((entry) => ({
        entityType: entry.entityType,
        label: entry.label,
        explanation: entry.explanation
      }))
    })),
    documentMetadataOnly: {
      missingKeyDocuments: snapshot.documents.missingKeyDocuments.map((item) => item.title),
      uncategorizedCount: snapshot.documents.uncategorizedDocuments.length,
      staleCount: snapshot.documents.staleDocuments.length,
      rag: snapshot.documents.ragReadiness.message
    },
    missingData: snapshot.executiveSummary.missingData
  };

  return redactTokenLikeValue(context);
}
