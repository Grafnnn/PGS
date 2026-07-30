import { effectiveChecklistStatus, effectiveWarrantyStatus, summarizeProjectCloseout } from "@/lib/project-closeout";
import { prisma } from "@/lib/prisma";

const packageInclude = {
  checklistItems: {
    include: {
      document: {
        select: { id: true, title: true, category: true, fileName: true, version: true }
      }
    },
    orderBy: { sequence: "asc" as const }
  },
  transmittal: {
    select: { id: true, sequence: true, subject: true, status: true, revision: true }
  }
};

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export async function loadProjectCloseout(projectId: string, now = new Date()) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      organizationId: true,
      name: true,
      status: true,
      endsAt: true,
      closeoutPackages: {
        include: packageInclude,
        orderBy: { sequence: "asc" }
      },
      warrantyObligations: {
        include: {
          package: { select: { id: true, number: true, title: true } },
          sourceDocument: { select: { id: true, title: true, category: true, fileName: true, version: true } }
        },
        orderBy: { sequence: "asc" }
      },
      documents: {
        select: { id: true, title: true, category: true, fileName: true, version: true, uploadedAt: true },
        orderBy: { uploadedAt: "desc" },
        take: 500
      },
      documentTransmittals: {
        select: { id: true, sequence: true, subject: true, status: true, revision: true, issuedAt: true },
        orderBy: { sequence: "desc" },
        take: 100
      },
      qualityIssues: {
        where: { acceptanceBlocker: true, status: { notIn: ["closed", "voided"] } },
        select: { id: true, number: true, title: true, severity: true, status: true, dueAt: true },
        orderBy: [{ severity: "desc" }, { dueAt: "asc" }],
        take: 100
      }
    }
  });

  if (!project) return null;
  const blockerCount = project.qualityIssues.length;
  const packages = project.closeoutPackages.map((item) => ({
    id: item.id,
    sequence: item.sequence,
    number: item.number,
    title: item.title,
    scope: item.scope,
    status: item.status,
    responsibleParty: item.responsibleParty,
    dueAt: iso(item.dueAt),
    submittedAt: iso(item.submittedAt),
    acceptedAt: iso(item.acceptedAt),
    handoverAt: iso(item.handoverAt),
    closedAt: iso(item.closedAt),
    decisionComment: item.decisionComment,
    notes: item.notes,
    transmittal: item.transmittal,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    checklistItems: item.checklistItems.map((checklistItem) => ({
      id: checklistItem.id,
      sequence: checklistItem.sequence,
      title: checklistItem.title,
      category: checklistItem.category,
      required: checklistItem.required,
      status: effectiveChecklistStatus(checklistItem, blockerCount),
      storedStatus: checklistItem.status,
      sourceType: checklistItem.sourceType,
      sourceId: checklistItem.sourceId,
      documentId: checklistItem.documentId,
      document: checklistItem.document,
      notes: checklistItem.notes,
      confirmedBy: checklistItem.confirmedBy,
      confirmedAt: iso(checklistItem.confirmedAt),
      updatedAt: checklistItem.updatedAt.toISOString()
    }))
  }));
  const warranties = project.warrantyObligations.map((item) => ({
    id: item.id,
    sequence: item.sequence,
    number: item.number,
    title: item.title,
    category: item.category,
    status: effectiveWarrantyStatus(item, now),
    storedStatus: item.status,
    counterparty: item.counterparty,
    responsibleParty: item.responsibleParty,
    startsAt: iso(item.startsAt),
    endsAt: iso(item.endsAt),
    noticeDays: item.noticeDays,
    retentionAmount: Number(item.retentionAmount),
    retentionReleaseAt: iso(item.retentionReleaseAt),
    terms: item.terms,
    notes: item.notes,
    package: item.package,
    sourceDocumentId: item.sourceDocumentId,
    sourceDocument: item.sourceDocument,
    closedAt: iso(item.closedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  }));
  const summary = summarizeProjectCloseout({
    projectStatus: project.status,
    packages,
    warranties,
    openAcceptanceBlockers: blockerCount,
    now
  });

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      endsAt: project.endsAt.toISOString()
    },
    packages,
    warranties,
    documents: project.documents.map((item) => ({ ...item, uploadedAt: item.uploadedAt.toISOString() })),
    transmittals: project.documentTransmittals.map((item) => ({ ...item, issuedAt: iso(item.issuedAt) })),
    openAcceptanceIssues: project.qualityIssues.map((item) => ({ ...item, dueAt: iso(item.dueAt) })),
    summary
  };
}

export type ProjectCloseoutPayload = NonNullable<Awaited<ReturnType<typeof loadProjectCloseout>>>;
