import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { serializeQualityIssue } from "@/lib/quality-management";
import { qualityIssueInclude } from "@/lib/quality-management-db";
import { prisma } from "@/lib/prisma";

type Params = { projectId: string; issueId: string; evidenceId: string };

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const issue = await prisma.projectQualityIssue.findFirst({
      where: { id: params.issueId, projectId: params.projectId },
      include: qualityIssueInclude
    });
    if (!issue) return NextResponse.json({ error: "Quality issue not found" }, { status: 404 });
    if (!["open", "in_progress"].includes(issue.status)) return NextResponse.json({ error: "Evidence is locked at the verification stage" }, { status: 409 });
    const evidence = issue.evidence.find((item) => item.id === params.evidenceId);
    if (!evidence) return NextResponse.json({ error: "Quality evidence not found" }, { status: 404 });
    const item = await prisma.$transaction(async (tx) => {
      await tx.projectQualityEvidence.delete({ where: { id: evidence.id } });
      await tx.projectQualityIssueEvent.create({
        data: {
          issueId: issue.id,
          eventType: "remove_evidence",
          statusBefore: issue.status,
          statusAfter: issue.status,
          comment: `${evidence.phase}: ${evidence.titleSnapshot}`,
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
        summary: `${issue.number}: удалено evidence ${evidence.titleSnapshot}`
      });
      return updated;
    });
    return NextResponse.json({ item: serializeQualityIssue(item) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Quality evidence delete failed" }, { status: 500 });
  }
}
