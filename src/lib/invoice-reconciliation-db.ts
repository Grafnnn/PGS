import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const invoiceInclude = Prisma.validator<Prisma.ProjectInvoiceInclude>()({
  costCode: { select: { code: true, name: true } },
  commitment: { select: { number: true, title: true, counterparty: true } },
  paymentApplication: { select: { number: true, status: true } },
  payment: { select: { title: true, status: true } },
  linkedDocument: { select: { title: true, fileName: true } }
});

export async function resolveInvoiceReferences(projectId: string, input: {
  direction: "AP" | "AR";
  costCodeId?: string;
  commitmentId?: string;
  paymentApplicationId?: string;
  paymentId?: string;
  linkedDocumentId?: string;
}) {
  const [costCode, commitment, paymentApplication, payment, linkedDocument] = await Promise.all([
    input.costCodeId
      ? prisma.projectCostCode.findFirst({ where: { id: input.costCodeId, projectId }, select: { id: true } })
      : null,
    input.commitmentId
      ? prisma.projectCommitment.findFirst({
          where: { id: input.commitmentId, projectId },
          select: { id: true, counterparty: true, status: true, lines: { select: { scheduledValue: true } } }
        })
      : null,
    input.paymentApplicationId
      ? prisma.projectPaymentApplication.findFirst({
          where: { id: input.paymentApplicationId, projectId },
          select: { id: true, commitmentId: true, status: true, netAmount: true }
        })
      : null,
    input.paymentId
      ? prisma.payment.findFirst({
          where: { id: input.paymentId, projectId },
          select: { id: true, direction: true, status: true, amount: true }
        })
      : null,
    input.linkedDocumentId
      ? prisma.document.findFirst({ where: { id: input.linkedDocumentId, projectId }, select: { id: true } })
      : null
  ]);

  if (input.costCodeId && !costCode) return { error: "Cost code not found in this project" as const };
  if (input.commitmentId && !commitment) return { error: "Commitment not found in this project" as const };
  if (input.paymentApplicationId && !paymentApplication) return { error: "Payment application not found in this project" as const };
  if (input.paymentId && !payment) return { error: "Payment not found in this project" as const };
  if (input.linkedDocumentId && !linkedDocument) return { error: "Document not found in this project" as const };
  if (commitment && paymentApplication && paymentApplication.commitmentId !== commitment.id) {
    return { error: "Payment application does not belong to the selected commitment" as const };
  }
  const expectedDirection = input.direction === "AP" ? "outgoing" : "incoming";
  if (payment && payment.direction !== expectedDirection) {
    return { error: "Payment direction does not match invoice direction" as const };
  }
  if (input.direction === "AR" && commitment && commitment.status === "terminated") {
    return { error: "Terminated commitment cannot be used for an AR invoice" as const };
  }
  return { costCode, commitment, paymentApplication, payment, linkedDocument };
}
