import { budgetTotals, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { getProjectBundle } from "@/lib/demo-data";
import { getProjectBundleFromDb } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/serializers";
import type { AiProjectContext } from "./types";

const LIMIT = 8;

function daysUntil(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export async function buildAiProjectContext(projectId: string): Promise<AiProjectContext> {
  const databaseAvailable = Boolean(process.env.DATABASE_URL);
  const bundle = (databaseAvailable ? await getProjectBundleFromDb(projectId).catch(() => null) : null) ?? getProjectBundle(projectId);
  const documents = databaseAvailable
    ? await prisma.document
        .findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: LIMIT })
        .then((items) => items.map(serializeDocument))
        .catch(() => [])
    : [];
  const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
  const works = workTotals(bundle.scheduleItems);
  const materials = materialTotals(bundle.materials);
  const finance = financeTotals(bundle.payments);
  const dataLimitations: string[] = [];

  const sectionMap = new Map<string, { forecastCost: number; items: number }>();
  for (const item of bundle.budgetItems) {
    const current = sectionMap.get(item.section) ?? { forecastCost: 0, items: 0 };
    current.forecastCost += item.qty * item.forecastUnitPrice;
    current.items += 1;
    sectionMap.set(item.section, current);
  }

  if (bundle.budgetItems.length > LIMIT) dataLimitations.push(`ВОР ограничена top-${LIMIT} проблемных/агрегированных позиций.`);
  if (bundle.scheduleItems.length > LIMIT) dataLimitations.push(`График ограничен top-${LIMIT} работ.`);
  if (bundle.materials.length > LIMIT) dataLimitations.push(`Материалы ограничены top-${LIMIT} критичных позиций.`);
  dataLimitations.push("Документы анализируются по метаданным: OCR/извлеченный текст пока не подключены.");

  return {
    project: {
      id: bundle.project.id,
      name: bundle.project.name,
      customer: bundle.project.customer,
      object: bundle.project.object,
      address: bundle.project.address,
      status: bundle.project.status,
      manager: bundle.project.manager,
      contractAmount: bundle.project.contractAmount,
      startsAt: bundle.project.startsAt,
      endsAt: bundle.project.endsAt
    },
    budget: {
      totalPlannedCost: budget.totalPlannedCost,
      totalActualCost: budget.totalActualCost,
      totalForecastCost: budget.totalForecastCost,
      forecastProfit: budget.forecastProfit,
      forecastMarginPercent: budget.forecastMarginPercent,
      zeroPrices: bundle.budgetItems.filter((item) => item.plannedUnitPrice <= 0 || item.forecastUnitPrice <= 0).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, section: item.section })),
      zeroQty: bundle.budgetItems.filter((item) => item.qty <= 0).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, section: item.section })),
      suspicious: bundle.budgetItems
        .filter((item) => item.qty * item.forecastUnitPrice > bundle.project.contractAmount * 0.12 || item.forecastUnitPrice > item.plannedUnitPrice * 1.15)
        .slice(0, LIMIT)
        .map((item) => ({ id: item.id, name: item.name, section: item.section, reason: item.forecastUnitPrice > item.plannedUnitPrice * 1.15 ? "Прогнозная цена выше плановой более чем на 15%" : "Крупная доля в договорной сумме" })),
      sections: Array.from(sectionMap.entries())
        .map(([name, value]) => ({ name, ...value }))
        .sort((left, right) => right.forecastCost - left.forecastCost)
        .slice(0, LIMIT)
    },
    schedule: {
      completionPercent: works.completionPercent,
      delayed: bundle.scheduleItems.filter((item) => item.status === "delayed").slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, owner: item.owner, endsAt: item.endsAt, dependency: item.dependency })),
      upcoming: bundle.scheduleItems.filter((item) => daysUntil(item.startsAt) <= 14 && item.status !== "done").slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, owner: item.owner, startsAt: item.startsAt, endsAt: item.endsAt })),
      missingOwners: bundle.scheduleItems.filter((item) => !item.owner).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name }))
    },
    materials: {
      deficit: materials.deficitItems.slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, unit: item.unit, shortage: item.requiredQty - item.orderedQty, neededAt: item.neededAt, supplier: item.supplier })),
      dueSoon: bundle.materials.filter((item) => daysUntil(item.neededAt) <= 7 && item.status !== "closed").slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, neededAt: item.neededAt, status: item.status })),
      overBudget: bundle.materials.filter((item) => item.actualUnitPrice > item.plannedUnitPrice && item.actualUnitPrice > 0).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, plannedUnitPrice: item.plannedUnitPrice, actualUnitPrice: item.actualUnitPrice })),
      missingSupplier: bundle.materials.filter((item) => !item.supplier || item.supplier === "Не выбран").slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name }))
    },
    procurement: {
      active: bundle.procurementRequests.filter((item) => item.status !== "closed" && item.status !== "rejected").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, status: item.status, priority: item.priority, neededAt: item.neededAt })),
      critical: bundle.procurementRequests.filter((item) => item.priority === "critical" || item.priority === "high").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, priority: item.priority, neededAt: item.neededAt }))
    },
    finance: {
      incomingPayments: finance.incomingPayments,
      outgoingPayments: finance.outgoingPayments,
      cashGap: finance.cashGap,
      financingNeed: finance.financingNeed,
      overdue: bundle.payments.filter((item) => item.status === "overdue").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, amount: item.amount, plannedAt: item.plannedAt }))
    },
    risks: bundle.risks.filter((item) => item.status !== "closed").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, priority: item.priority, status: item.status, owner: item.owner, dueAt: item.dueAt, reason: item.reason })),
    documents: documents.map((item) => ({ id: item.id, title: item.fileName ?? item.title, category: item.category, mimeType: item.mimeType, uploadedAt: item.uploadedAt ?? item.createdAt, previewAvailable: item.previewAvailable })),
    dailyReports: bundle.dailyReports.slice(0, LIMIT).map((item) => ({ id: item.id, date: item.date, author: item.author, completedWorks: item.completedWorks, issues: item.issues, status: item.status, workers: item.workers, engineers: item.engineers })),
    dataLimitations
  };
}
