import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { buildCostCodeBaseline, costCodeBaselineSchema } from "@/lib/cost-codes";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = costCodeBaselineSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const budgetItems = await prisma.budgetItem.findMany({
      where: { projectId: params.projectId },
      select: { id: true, section: true, subsection: true, kind: true, name: true }
    });
    const preview = buildCostCodeBaseline(budgetItems);
    const existing = await prisma.projectCostCode.findMany({ where: { projectId: params.projectId, code: { in: preview.nodes.map((node) => node.code) } } });
    const conflicts = preview.nodes.flatMap((node) => {
      const current = existing.find((item) => item.code === node.code);
      return current && (current.name !== node.name || current.segment !== node.segment)
        ? [{ code: node.code, existingName: current.name, proposedName: node.name }]
        : [];
    });
    if (data.mode === "preview") return NextResponse.json({ preview: { ...preview, conflicts } });
    if (conflicts.length) return NextResponse.json({ error: "Existing cost codes conflict with the VOR baseline", conflicts }, { status: 409 });

    const result = await prisma.$transaction(async (tx) => {
      const keyToId = new Map<string, string>();
      const codeToId = new Map<string, string>();
      let created = 0;
      let reused = 0;
      for (const node of preview.nodes) {
        const current = existing.find((item) => item.code === node.code);
        const parentId = node.parentKey ? keyToId.get(node.parentKey) : null;
        const item = current
          ? await tx.projectCostCode.update({ where: { id: current.id }, data: { parentId, sortOrder: node.sortOrder, status: "active" } })
          : await tx.projectCostCode.create({ data: {
            organizationId: project.organizationId, projectId: params.projectId, parentId, code: node.code, name: node.name,
            segment: node.segment, costType: node.costType, status: "active", source: node.source, sortOrder: node.sortOrder,
            createdBy: user?.authenticated ? user.id : null
          } });
        if (current) reused += 1;
        else created += 1;
        keyToId.set(node.key, item.id);
        codeToId.set(node.code, item.id);
      }
      for (const assignment of preview.assignments) {
        const costCodeId = codeToId.get(assignment.code);
        if (!costCodeId) continue;
        await tx.budgetItem.update({ where: { id: assignment.entityId }, data: { costCodeId } });
        await tx.scheduleItem.updateMany({ where: { projectId: params.projectId, budgetItemId: assignment.entityId }, data: { costCodeId } });
        await tx.projectChangeOrderItem.updateMany({ where: { budgetItemId: assignment.entityId, changeOrder: { projectId: params.projectId } }, data: { costCodeId } });
      }
      const summary = { ...preview.summary, created, reused, propagatedToScheduleAndChanges: true };
      await writeAudit(tx, {
        organizationId: project.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "cost_code_baseline", entityId: params.projectId,
        action: "create", summary: `Сформирован CBS-WBS baseline: ${created} новых кодов, ${preview.assignments.length} строк ВОР`, after: summary
      });
      return summary;
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Cost code baseline conflict; retry" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid baseline request" }, { status: 400 });
    return NextResponse.json({ error: "Cost code baseline failed" }, { status: 500 });
  }
}
