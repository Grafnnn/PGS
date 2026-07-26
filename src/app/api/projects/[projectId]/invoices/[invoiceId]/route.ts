import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { invoiceCreateSchema, invoiceUpdateSchema, serializeProjectInvoice } from "@/lib/invoice-reconciliation";
import { invoiceInclude, resolveInvoiceReferences } from "@/lib/invoice-reconciliation-db";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; invoiceId: string } };

const transitions: Record<string, string[]> = {
  received: ["received", "approved", "disputed", "void"],
  approved: ["approved", "disputed", "paid", "void"],
  disputed: ["disputed", "received", "approved", "void"],
  paid: ["paid"],
  void: ["void"]
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = invoiceUpdateSchema.parse(await request.json().catch(() => ({})));
    if (!Object.keys(data).length) return NextResponse.json({ error: "Invoice update is empty" }, { status: 409 });
    const before = await prisma.projectInvoice.findFirst({
      where: { id: params.invoiceId, projectId: params.projectId },
      include: invoiceInclude
    });
    if (!before) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (["paid", "void"].includes(before.status) && Object.keys(data).some((key) => key !== "notes" && key !== "status")) {
      return NextResponse.json({ error: "Paid or void invoice is immutable" }, { status: 409 });
    }

    invoiceCreateSchema.parse({
      number: data.number ?? before.number,
      direction: data.direction ?? before.direction,
      invoiceType: data.invoiceType ?? before.invoiceType,
      counterparty: data.counterparty ?? before.counterparty,
      issueDate: data.issueDate ?? before.issueDate.toISOString(),
      dueDate: data.dueDate ?? before.dueDate.toISOString(),
      servicePeriodStart: data.servicePeriodStart === undefined
        ? before.servicePeriodStart?.toISOString() ?? ""
        : data.servicePeriodStart,
      servicePeriodEnd: data.servicePeriodEnd === undefined
        ? before.servicePeriodEnd?.toISOString() ?? ""
        : data.servicePeriodEnd,
      grossAmount: data.grossAmount ?? Number(before.grossAmount),
      taxAmount: data.taxAmount ?? Number(before.taxAmount),
      currency: data.currency ?? before.currency,
      costCodeId: data.costCodeId === undefined ? before.costCodeId ?? "" : data.costCodeId,
      commitmentId: data.commitmentId === undefined ? before.commitmentId ?? "" : data.commitmentId,
      paymentApplicationId: data.paymentApplicationId === undefined ? before.paymentApplicationId ?? "" : data.paymentApplicationId,
      paymentId: data.paymentId === undefined ? before.paymentId ?? "" : data.paymentId,
      linkedDocumentId: data.linkedDocumentId === undefined ? before.linkedDocumentId ?? "" : data.linkedDocumentId,
      notes: data.notes === undefined ? before.notes ?? "" : data.notes
    });

    const nextDirection = data.direction ?? before.direction as "AP" | "AR";
    const nextStatus = data.status ?? before.status;
    const matchingFields = ["direction", "counterparty", "grossAmount", "costCodeId", "commitmentId", "paymentApplicationId", "paymentId", "linkedDocumentId"];
    const resetMatch = Object.keys(data).some((key) => matchingFields.includes(key));
    if (!(transitions[before.status] ?? []).includes(nextStatus)) {
      return NextResponse.json({ error: `Invoice transition ${before.status} -> ${nextStatus} is not allowed` }, { status: 409 });
    }
    if (nextStatus === "approved" && (before.matchStatus !== "matched" || resetMatch)) {
      return NextResponse.json({ error: "Invoice must be successfully reconciled before approval" }, { status: 409 });
    }
    const referenceInput = {
      direction: nextDirection,
      costCodeId: data.costCodeId === undefined ? before.costCodeId ?? "" : data.costCodeId,
      commitmentId: data.commitmentId === undefined ? before.commitmentId ?? "" : data.commitmentId,
      paymentApplicationId: data.paymentApplicationId === undefined ? before.paymentApplicationId ?? "" : data.paymentApplicationId,
      paymentId: data.paymentId === undefined ? before.paymentId ?? "" : data.paymentId,
      linkedDocumentId: data.linkedDocumentId === undefined ? before.linkedDocumentId ?? "" : data.linkedDocumentId
    };
    const references = await resolveInvoiceReferences(params.projectId, referenceInput);
    if ("error" in references) return NextResponse.json({ error: references.error }, { status: 409 });
    if (nextStatus === "paid" && (!references.payment || references.payment.status !== "paid")) {
      return NextResponse.json({ error: "Paid status requires a linked payment with paid status" }, { status: 409 });
    }

    const now = new Date();
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.projectInvoice.update({
        where: { id: before.id },
        data: {
          number: data.number,
          direction: data.direction,
          invoiceType: data.invoiceType,
          counterparty: data.counterparty,
          issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          servicePeriodStart: data.servicePeriodStart === undefined ? undefined : data.servicePeriodStart ? new Date(data.servicePeriodStart) : null,
          servicePeriodEnd: data.servicePeriodEnd === undefined ? undefined : data.servicePeriodEnd ? new Date(data.servicePeriodEnd) : null,
          grossAmount: data.grossAmount,
          taxAmount: data.taxAmount,
          currency: data.currency?.toUpperCase(),
          costCodeId: data.costCodeId === undefined ? undefined : data.costCodeId || null,
          commitmentId: data.commitmentId === undefined ? undefined : data.commitmentId || null,
          paymentApplicationId: data.paymentApplicationId === undefined ? undefined : data.paymentApplicationId || null,
          paymentId: data.paymentId === undefined ? undefined : data.paymentId || null,
          linkedDocumentId: data.linkedDocumentId === undefined ? undefined : data.linkedDocumentId || null,
          notes: data.notes === undefined ? undefined : data.notes || null,
          status: data.status,
          matchStatus: resetMatch ? "unmatched" : undefined,
          matchSnapshot: resetMatch ? Prisma.DbNull : undefined,
          approvedAt: nextStatus === "approved" && before.status !== "approved" ? now : undefined,
          paidAt: nextStatus === "paid" && before.status !== "paid" ? now : undefined,
          voidedAt: nextStatus === "void" && before.status !== "void" ? now : undefined
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
        action: "update",
        summary: `Обновлён счёт ${before.number}: ${before.status} → ${updated.status}`,
        before: serializeProjectInvoice(before),
        after: serializeProjectInvoice(updated)
      });
      return updated;
    });
    return NextResponse.json({ item: serializeProjectInvoice(item) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Invoice number conflict" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid invoice update" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invoice update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const before = await prisma.projectInvoice.findFirst({
      where: { id: params.invoiceId, projectId: params.projectId },
      include: invoiceInclude
    });
    if (!before) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (!["received", "disputed"].includes(before.status)) {
      return NextResponse.json({ error: "Only received or disputed invoice can be deleted" }, { status: 409 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.projectInvoice.delete({ where: { id: before.id } });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_invoice",
        entityId: before.id,
        action: "delete",
        summary: `Удалён счёт ${before.direction} ${before.number}`,
        before: serializeProjectInvoice(before)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Invoice delete failed" }, { status: 500 });
  }
}
