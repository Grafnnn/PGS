import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { paymentApplicationAmounts, paymentApplicationCreateSchema, serializePaymentApplication, validatePaymentApplicationLines } from "@/lib/contract-commitments";
import { applicationInclude } from "@/lib/contract-commitments-db";
import { prisma } from "@/lib/prisma";

type Params = { projectId: string; commitmentId: string };

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = paymentApplicationCreateSchema.parse(await request.json().catch(() => ({})));
    const commitment = await prisma.projectCommitment.findFirst({
      where: { id: params.commitmentId, projectId: params.projectId },
      include: {
        lines: true,
        paymentApplications: { where: { status: { in: ["draft", "submitted", "approved", "paid"] } }, include: { lines: true } }
      }
    });
    if (!commitment) return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    if (!["approved", "active"].includes(commitment.status)) return NextResponse.json({ error: "Payment applications require an approved or active commitment" }, { status: 409 });
    if (commitment.paymentApplications.some((application) => application.status === "draft" || application.status === "submitted")) {
      return NextResponse.json({ error: "Resolve the current draft or submitted application first" }, { status: 409 });
    }
    const validated = validatePaymentApplicationLines(commitment, data.lines);
    if (validated.error) return NextResponse.json({ error: validated.error }, { status: 409 });
    const totals = paymentApplicationAmounts(validated.lines);
    if (totals.gross <= 0) return NextResponse.json({ error: "Application amount must be greater than zero" }, { status: 409 });

    const item = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectPaymentApplication.findFirst({ where: { commitmentId: commitment.id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const sequence = (latest?.sequence ?? 0) + 1;
      const created = await tx.projectPaymentApplication.create({
        data: {
          organizationId: commitment.organizationId,
          projectId: params.projectId,
          commitmentId: commitment.id,
          sequence,
          number: `APP-${String(sequence).padStart(3, "0")}`,
          periodStart: new Date(data.periodStart),
          periodEnd: new Date(data.periodEnd),
          currentAmount: totals.current,
          materialsStored: totals.materialsStored,
          retentionAmount: totals.retention,
          netAmount: totals.net,
          notes: data.notes || null,
          createdBy: user?.authenticated ? user.id : null,
          lines: { create: validated.lines }
        },
        include: applicationInclude
      });
      await writeAudit(tx, {
        organizationId: commitment.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "payment_application",
        entityId: created.id,
        action: "create",
        summary: `${commitment.number}: создана заявка ${created.number} на ${totals.net.toLocaleString("ru-RU")} ₽`,
        after: serializePaymentApplication(created)
      });
      return created;
    });
    return NextResponse.json({ item: serializePaymentApplication(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Payment application sequence conflict; retry" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid payment application" }, { status: 400 });
    return NextResponse.json({ error: "Payment application create failed" }, { status: 500 });
  }
}
