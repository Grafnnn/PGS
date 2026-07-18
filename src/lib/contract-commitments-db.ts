import { prisma } from "@/lib/prisma";

export const applicationInclude = {
  lines: { orderBy: { createdAt: "asc" as const } },
  payment: { select: { id: true, title: true, status: true, amount: true, direction: true } }
};

export const commitmentInclude = {
  lines: { include: { costCode: { select: { code: true, name: true } } }, orderBy: { sequence: "asc" as const } },
  linkedDocument: { select: { title: true, fileName: true } },
  sourceProcurementRequest: { select: { id: true, title: true } },
  approvalWorkflowRun: { select: { id: true, title: true, status: true } },
  changeOrders: { select: { id: true, number: true, title: true, status: true, approvedAmount: true, committedAmount: true }, orderBy: { sequence: "asc" as const } },
  paymentApplications: {
    include: applicationInclude,
    orderBy: { sequence: "desc" as const }
  }
};

export async function resolveCommitmentLineReferences(
  projectId: string,
  lines: Array<{ budgetItemId?: string; costCodeId?: string; sourceProcurementRequestItemId?: string }>
) {
  const budgetIds = [...new Set(lines.map((line) => line.budgetItemId).filter(Boolean))] as string[];
  const costCodeIds = [...new Set(lines.map((line) => line.costCodeId).filter(Boolean))] as string[];
  const procurementItemIds = [...new Set(lines.map((line) => line.sourceProcurementRequestItemId).filter(Boolean))] as string[];
  const [budgetItems, costCodes, procurementItems] = await Promise.all([
    budgetIds.length ? prisma.budgetItem.findMany({ where: { projectId, id: { in: budgetIds } }, select: { id: true, costCodeId: true } }) : [],
    costCodeIds.length ? prisma.projectCostCode.findMany({ where: { projectId, id: { in: costCodeIds }, status: "active" }, select: { id: true } }) : [],
    procurementItemIds.length ? prisma.procurementRequestItem.findMany({ where: { id: { in: procurementItemIds }, request: { projectId } }, select: { id: true, costCodeId: true } }) : []
  ]);
  if (budgetItems.length !== budgetIds.length) return { error: "Budget item does not belong to project", budgetCostCodes: new Map<string, string | null>(), procurementCostCodes: new Map<string, string | null>() };
  if (costCodes.length !== costCodeIds.length) return { error: "Active cost code does not belong to project", budgetCostCodes: new Map<string, string | null>(), procurementCostCodes: new Map<string, string | null>() };
  if (procurementItems.length !== procurementItemIds.length) return { error: "Procurement item does not belong to project", budgetCostCodes: new Map<string, string | null>(), procurementCostCodes: new Map<string, string | null>() };
  return {
    error: "",
    budgetCostCodes: new Map(budgetItems.map((item) => [item.id, item.costCodeId])),
    procurementCostCodes: new Map(procurementItems.map((item) => [item.id, item.costCodeId]))
  };
}
