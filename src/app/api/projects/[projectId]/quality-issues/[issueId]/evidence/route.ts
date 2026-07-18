import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { qualityEvidenceCreateSchema, serializeQualityIssue } from "@/lib/quality-management";
import { qualityIssueInclude } from "@/lib/quality-management-db";
import { prisma } from "@/lib/prisma";

type Params = { projectId: string; issueId: string };

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = qualityEvidenceCreateSchema.parse(await request.json().catch(() => ({})));
    const [issue, document] = await Promise.all([
      prisma.projectQualityIssue.findFirst({ where: { id: params.issueId, projectId: params.projectId }, include: qualityIssueInclude }),
      prisma.document.findFirst({
        where: { id: data.documentId, projectId: params.projectId },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } }
      })
    ]);
    if (!issue) return NextResponse.json({ error: "Quality issue not found" }, { status: 404 });
    if (!document) return NextResponse.json({ error: "Evidence document not found" }, { status: 404 });
    if (["closed", "void"].includes(issue.status)) return NextResponse.json({ error: "Closed or void issue cannot accept evidence" }, { status: 409 });
    const latestVersion = document.versions[0];
    const item = await prisma.$transaction(async (tx) => {
      await tx.projectQualityEvidence.create({
        data: {
          issueId: issue.id,
          phase: data.phase,
          documentId: document.id,
          documentVersionId: latestVersion?.id ?? null,
          documentVersion: latestVersion?.versionNumber ?? document.version,
          titleSnapshot: document.title,
          fileNameSnapshot: latestVersion?.fileName ?? document.fileName,
          note: data.note || null,
          createdBy: user?.authenticated ? user.id : null
        }
      });
      await tx.projectQualityIssueEvent.create({
        data: {
          issueId: issue.id,
          eventType: "add_evidence",
          statusBefore: issue.status,
          statusAfter: issue.status,
          comment: `${data.phase}: ${document.title}`,
          createdBy: user?.authenticated ? user.id : null,
          createdByName: user?.name ?? "local-user"
        }
      });
      const updated = await tx.projectQualityIssue.findUniqueOrThrow({ where: { id: issue.id }, include: qualityIssueInclude });
      await writeAudit(tx, {
        organizationId: issue.organizationId,
        projectId: issue.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_issue",
        entityId: issue.id,
        action: "update",
        summary: `${issue.number}: добавлено evidence ${document.title} · v${latestVersion?.versionNumber ?? document.version}`
      });
      return updated;
    });
    return NextResponse.json({ item: serializeQualityIssue(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid quality evidence" }, { status: 400 });
    return NextResponse.json({ error: "Quality evidence create failed" }, { status: 500 });
  }
}
