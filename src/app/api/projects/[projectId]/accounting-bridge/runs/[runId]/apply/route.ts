import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AccountingImportPreview } from "@/lib/accounting-bridge";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const applySchema = z.object({ confirmed: z.literal(true) }).strict();

function isStoredPreview(value: unknown): value is AccountingImportPreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as Partial<AccountingImportPreview>;
  return Array.isArray(preview.matches) && typeof preview.sourceSystem === "string" && Boolean(preview.summary);
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string; runId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "sync_accounting"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = applySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Explicit confirmation is required" }, { status: 400 });

  const run = await prisma.accountingSyncRun.findFirst({ where: { id: params.runId, projectId: params.projectId } });
  if (!run) return NextResponse.json({ error: "Accounting run not found" }, { status: 404 });
  if (run.status !== "preview") return NextResponse.json({ error: "Accounting run is already finalized" }, { status: 409 });
  const previewPayload = run.payload;
  if (!isStoredPreview(previewPayload)) return NextResponse.json({ error: "Accounting preview payload is invalid" }, { status: 409 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      let updatedPayments = 0;
      let linkedPayments = 0;
      let skippedLinks = 0;

      for (const match of previewPayload.matches) {
        if (match.status !== "matched" || !match.paymentId) continue;
        const payment = await tx.payment.findFirst({ where: { id: match.paymentId, projectId: params.projectId } });
        if (!payment) continue;
        if (match.action === "mark_paid") {
          await tx.payment.update({ where: { id: payment.id }, data: { status: "paid", paidAt: new Date(`${match.row.date}T12:00:00Z`) } });
          updatedPayments += 1;
        }
        if (match.row.externalId) {
          const entityLink = await tx.accountingExternalLink.findFirst({
            where: { projectId: params.projectId, externalSystem: run.sourceSystem, entityType: "payment", entityId: payment.id }
          });
          if (entityLink && entityLink.externalId !== match.row.externalId) {
            skippedLinks += 1;
          } else if (entityLink) {
            await tx.accountingExternalLink.update({ where: { id: entityLink.id }, data: { syncRunId: run.id, lastSeenAt: new Date() } });
            linkedPayments += 1;
          } else {
            await tx.accountingExternalLink.create({
              data: {
                organizationId: run.organizationId,
                projectId: params.projectId,
                syncRunId: run.id,
                entityType: "payment",
                entityId: payment.id,
                externalSystem: run.sourceSystem,
                externalId: match.row.externalId,
                metadata: { rowNumber: match.row.rowNumber, score: match.score }
              }
            });
            linkedPayments += 1;
          }
        }
      }

      const summary = { updatedPayments, linkedPayments, skippedLinks, unresolved: run.unresolvedCount };
      await tx.accountingSyncRun.update({ where: { id: run.id }, data: { status: "applied", appliedAt: new Date(), summary: { ...(run.summary as Record<string, unknown>), apply: summary } } });
      await writeAudit(tx, {
        organizationId: run.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "accounting_sync",
        entityId: run.id,
        action: "import_commit",
        summary: "Применена подтвержденная сверка ERP / Бухгалтерия",
        after: summary
      });
      return summary;
    });

    return NextResponse.json({ ok: true, runId: run.id, result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "External accounting identifier is already linked" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    console.error(error);
    return NextResponse.json({ error: "Accounting apply failed" }, { status: 500 });
  }
}
