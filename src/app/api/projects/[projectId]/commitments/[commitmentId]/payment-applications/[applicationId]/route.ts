import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { expectedPaymentDirection, paymentApplicationActionSchema, resolvePaymentApplicationTransition, serializePaymentApplication } from "@/lib/contract-commitments";
import { applicationInclude } from "@/lib/contract-commitments-db";
import { prisma } from "@/lib/prisma";

type Params = { projectId: string; commitmentId: string; applicationId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (!("action" in raw)) return NextResponse.json({ error: "Edit the draft by replacing it with a new application" }, { status: 409 });
    const data = paymentApplicationActionSchema.parse(raw);
    const current = await prisma.projectPaymentApplication.findFirst({
      where: { id: params.applicationId, commitmentId: params.commitmentId, projectId: params.projectId },
      include: { ...applicationInclude, commitment: { select: { type: true, number: true } } }
    });
    if (!current) return NextResponse.json({ error: "Payment application not found" }, { status: 404 });
    const isAdmin = role === "OWNER" || role === "ADMIN";
    if (["approve", "reject", "mark_paid", "void"].includes(data.action) && !isAdmin) return NextResponse.json({ error: "Owner or administrator decision is required" }, { status: 403 });
    if (["reject", "void"].includes(data.action) && !data.comment) return NextResponse.json({ error: "Decision comment is required" }, { status: 400 });
    const nextStatus = resolvePaymentApplicationTransition(current.status, data.action);
    let payment: { id: string; title: string; status: string; amount: unknown; direction: string } | null = null;
    if (data.action === "mark_paid") {
      if (!data.paymentId) return NextResponse.json({ error: "A paid project payment is required" }, { status: 400 });
      payment = await prisma.payment.findFirst({ where: { id: data.paymentId, projectId: params.projectId }, select: { id: true, title: true, status: true, amount: true, direction: true } });
      if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      if (payment.status !== "paid") return NextResponse.json({ error: "Linked payment is not paid" }, { status: 409 });
      if (payment.direction !== expectedPaymentDirection(current.commitment.type)) return NextResponse.json({ error: "Payment direction does not match commitment type" }, { status: 409 });
      if (Number(payment.amount) + 0.01 < Number(current.netAmount)) return NextResponse.json({ error: "Linked payment amount is below the net application amount" }, { status: 409 });
      const existingLink = await prisma.projectPaymentApplication.findFirst({ where: { paymentId: payment.id, id: { not: current.id } }, select: { id: true } });
      if (existingLink) return NextResponse.json({ error: "Payment is already linked to another application" }, { status: 409 });
    }
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.projectPaymentApplication.updateMany({ where: { id: current.id, status: current.status, updatedAt: current.updatedAt }, data: { updatedAt: now } });
      if (claim.count !== 1) throw new Error("Payment application action was already handled");
      const item = await tx.projectPaymentApplication.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          decisionComment: data.comment || undefined,
          paymentId: payment?.id,
          submittedAt: data.action === "submit" ? now : undefined,
          approvedAt: data.action === "approve" ? now : undefined,
          rejectedAt: data.action === "reject" ? now : undefined,
          paidAt: data.action === "mark_paid" ? now : undefined,
          voidedAt: data.action === "void" ? now : undefined
        },
        include: applicationInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "payment_application",
        entityId: current.id,
        action: data.action === "approve" ? "accept" : "update",
        summary: `${current.commitment.number} / ${current.number}: ${data.action}${data.comment ? ` — ${data.comment}` : ""}`,
        before: serializePaymentApplication(current),
        after: serializePaymentApplication(item)
      });
      return item;
    });
    return NextResponse.json({ item: serializePaymentApplication(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Payment is already linked to another application" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid payment application action" }, { status: 400 });
    if (error instanceof Error && /Payment application action|Action /.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Payment application update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const current = await prisma.projectPaymentApplication.findFirst({
      where: { id: params.applicationId, commitmentId: params.commitmentId, projectId: params.projectId },
      include: { ...applicationInclude, commitment: { select: { number: true } } }
    });
    if (!current) return NextResponse.json({ error: "Payment application not found" }, { status: 404 });
    if (current.status !== "draft") return NextResponse.json({ error: "Only a draft application can be deleted" }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      await tx.projectPaymentApplication.delete({ where: { id: current.id } });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "payment_application",
        entityId: current.id,
        action: "delete",
        summary: `${current.commitment.number}: удален черновик ${current.number}`,
        before: serializePaymentApplication(current)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Payment application delete failed" }, { status: 500 });
  }
}
