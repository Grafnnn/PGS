import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject, getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { canTransitionExecutiveReport, executiveReportUpdateSchema, serializeExecutiveReport, type ExecutiveReportContent } from "@/lib/executive-reports";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; reportId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = executiveReportUpdateSchema.parse(await request.json().catch(() => ({})));
    const before = await prisma.executiveReport.findUnique({ where: { id: params.reportId } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Executive report not found" }, { status: 404 });
    if (data.status === before.status && data.title === undefined) return NextResponse.json({ error: "No executive report changes requested" }, { status: 409 });
    if (before.status !== "draft" && data.title) return NextResponse.json({ error: "Published or archived reports are immutable" }, { status: 409 });

    const effectiveRole = await getEffectiveProjectRole(user, params.projectId);
    const statusChange = data.status && data.status !== before.status;
    if (statusChange && effectiveRole !== "OWNER" && effectiveRole !== "ADMIN") {
      return NextResponse.json({ error: "Owner or administrator approval is required" }, { status: 403 });
    }
    if (data.status && !canTransitionExecutiveReport(before.status, data.status)) {
      return NextResponse.json({ error: "Invalid executive report status transition" }, { status: 409 });
    }

    const content = before.content as unknown as ExecutiveReportContent;
    if (data.status === "published" && ["blocked", "no_data"].includes(content.reportReadiness) && !data.publishConfirmed) {
      return NextResponse.json({ error: "Explicit confirmation is required to publish a blocked report" }, { status: 409 });
    }

    const publishing = data.status === "published" && before.status !== "published";
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.executiveReport.update({
        where: { id: params.reportId },
        data: {
          title: data.title,
          status: data.status,
          publishedAt: publishing ? new Date() : undefined,
          publishedBy: publishing ? user?.name ?? user?.email ?? "project-owner" : undefined
        }
      });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "executive_report",
        entityId: updated.id,
        action: publishing ? "accept" : "update",
        summary: publishing ? `Опубликован управленческий отчет v${updated.version}` : `Обновлен управленческий отчет v${updated.version}`,
        before: serializeExecutiveReport(before),
        after: serializeExecutiveReport(updated)
      });
      return updated;
    });

    return NextResponse.json({ item: serializeExecutiveReport(item) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid executive report update" }, { status: 400 });
    return NextResponse.json({ error: "Executive report update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const before = await prisma.executiveReport.findUnique({ where: { id: params.reportId } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Executive report not found" }, { status: 404 });
    if (before.status !== "draft") return NextResponse.json({ error: "Only draft reports can be deleted" }, { status: 409 });

    await prisma.$transaction(async (tx) => {
      await tx.executiveReport.delete({ where: { id: params.reportId } });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "executive_report",
        entityId: before.id,
        action: "delete",
        summary: `Удален черновик управленческого отчета v${before.version}`,
        before: serializeExecutiveReport(before)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Executive report delete failed" }, { status: 500 });
  }
}
