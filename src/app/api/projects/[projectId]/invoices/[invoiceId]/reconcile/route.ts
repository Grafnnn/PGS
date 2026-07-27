import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  buildInvoiceReconciliation,
  invoiceReconcileSchema,
  serializeProjectInvoice
} from "@/lib/invoice-reconciliation";
import { invoiceInclude } from "@/lib/invoice-reconciliation-db";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; invoiceId: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    invoiceReconcileSchema.parse(await request.json().catch(() => ({})));
    const before = await prisma.projectInvoice.findFirst({
      where: { id: params.invoiceId, projectId: params.projectId },
      include: {
        ...invoiceInclude,
        commitment: { select: { number: true, title: true, counterparty: true, status: true, lines: { select: { scheduledValue: true } } } },
        paymentApplication: { select: { number: true, status: true, commitmentId: true, netAmount: true } },
        payment: { select: { title: true, direction: true, status: true, amount: true } }
      }
    });
    if (!before) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (before.status === "void") return NextResponse.json({ error: "Void invoice cannot be reconciled" }, { status: 409 });

    const reconciliation = {
      ...buildInvoiceReconciliation(before),
      reconciledAt: new Date().toISOString()
    };
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.projectInvoice.update({
        where: { id: before.id },
        data: {
          matchStatus: reconciliation.matchStatus,
          matchSnapshot: reconciliation as unknown as Prisma.InputJsonValue
        },
        include: invoiceInclude
      });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_invoice",
        entityId: before.id,
        action: "accept",
        summary: `Сверка счёта ${before.number}: ${reconciliation.matchStatus}`,
        before: serializeProjectInvoice(before),
        after: { invoice: serializeProjectInvoice(updated), reconciliation }
      });
      return updated;
    });
    return NextResponse.json({ item: serializeProjectInvoice(item), reconciliation });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Explicit reconciliation confirmation is required" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invoice reconciliation failed" }, { status: 500 });
  }
}
