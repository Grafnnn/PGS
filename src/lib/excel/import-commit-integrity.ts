import type { Prisma } from "@prisma/client";

export class ImportCommitConflict extends Error {}

export class ImportBatchNotFound extends Error {}

export async function lockProjectForMutation(
  tx: Prisma.TransactionClient,
  projectId: string
) {
  await tx.$queryRaw`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE`;
}

export async function claimImportBatch(
  tx: Prisma.TransactionClient,
  input: { importBatchId: string; projectId: string; expectedUpdatedAt?: Date }
) {
  const claimed = await tx.importBatch.updateMany({
    where: {
      id: input.importBatchId,
      projectId: input.projectId,
      status: "previewed",
      ...(input.expectedUpdatedAt ? { updatedAt: input.expectedUpdatedAt } : {})
    },
    data: { status: "committing" }
  });
  if (claimed.count !== 1) {
    throw new ImportCommitConflict("Импорт уже сохраняется или был сохранён ранее.");
  }
}

export async function prepareScheduleRevision(
  tx: Prisma.TransactionClient,
  input: { projectId: string; replace: boolean }
) {
  await lockProjectForMutation(tx, input.projectId);
  const latest = await tx.scheduleItem.aggregate({
    where: { projectId: input.projectId },
    _max: { revision: true }
  });
  const latestRevision = latest._max.revision ?? 0;

  if (!input.replace) {
    const current = await tx.scheduleItem.aggregate({
      where: { projectId: input.projectId, isCurrent: true },
      _max: { revision: true }
    });
    return {
      revision: current._max.revision ?? (latestRevision > 0 ? latestRevision + 1 : 1),
      supersededCount: 0
    };
  }

  const superseded = await tx.scheduleItem.updateMany({
    where: { projectId: input.projectId, isCurrent: true },
    data: { isCurrent: false, supersededAt: new Date() }
  });
  return { revision: latestRevision + 1, supersededCount: superseded.count };
}

type BudgetLink = { id: string; code: string; name: string };
type PreviousBudgetLink = BudgetLink & { scheduleItemIds: string[] };

function budgetKey(item: Pick<BudgetLink, "code" | "name">) {
  return `${item.code.trim().toLocaleLowerCase("ru-RU")}\u0000${item.name.trim().toLocaleLowerCase("ru-RU")}`;
}

export async function prepareBudgetReplacement(
  tx: Prisma.TransactionClient,
  input: { projectId: string; replace: boolean }
) {
  if (!input.replace) return [] as PreviousBudgetLink[];
  const activeBaselineCount = await tx.projectControlBaseline.count({
    where: { projectId: input.projectId, status: "active" }
  });
  if (activeBaselineCount > 0) {
    throw new ImportCommitConflict("Нельзя заменить смету при активном контрольном baseline. Сначала создайте новую редакцию baseline или снимите текущую с активности.");
  }
  const previous = await tx.budgetItem.findMany({
    where: { projectId: input.projectId },
    select: { id: true, code: true, name: true }
  });
  if (!previous.length) return [];
  const scheduleItems = await tx.scheduleItem.findMany({
    where: { projectId: input.projectId, budgetItemId: { in: previous.map((item) => item.id) } },
    select: { id: true, budgetItemId: true }
  });
  const scheduleIdsByBudget = new Map<string, string[]>();
  for (const item of scheduleItems) {
    if (!item.budgetItemId) continue;
    const ids = scheduleIdsByBudget.get(item.budgetItemId) ?? [];
    ids.push(item.id);
    scheduleIdsByBudget.set(item.budgetItemId, ids);
  }
  return previous.map((item) => ({ ...item, scheduleItemIds: scheduleIdsByBudget.get(item.id) ?? [] }));
}

export async function relinkScheduleBudgetItems(
  tx: Prisma.TransactionClient,
  input: { projectId: string; previous: PreviousBudgetLink[]; created: BudgetLink[] }
) {
  if (!input.previous.length) return { relinked: 0, cleared: 0 };
  const createdByKey = new Map(input.created.map((item) => [budgetKey(item), item.id]));
  let relinked = 0;
  let cleared = 0;
  for (const previous of input.previous) {
    if (!previous.scheduleItemIds.length) continue;
    const nextId = createdByKey.get(budgetKey(previous)) ?? null;
    const result = await tx.scheduleItem.updateMany({
      where: { projectId: input.projectId, id: { in: previous.scheduleItemIds } },
      data: { budgetItemId: nextId }
    });
    if (nextId) relinked += result.count;
    else cleared += result.count;
  }
  return { relinked, cleared };
}
