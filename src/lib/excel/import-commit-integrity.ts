import type { Prisma } from "@prisma/client";

export class ImportCommitConflict extends Error {}

export async function claimImportBatch(
  tx: Prisma.TransactionClient,
  input: { importBatchId: string; projectId: string }
) {
  const claimed = await tx.importBatch.updateMany({
    where: { id: input.importBatchId, projectId: input.projectId, status: "previewed" },
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
  await tx.$queryRaw`SELECT id FROM "projects" WHERE id = ${input.projectId} FOR UPDATE`;
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

function budgetKey(item: Pick<BudgetLink, "code" | "name">) {
  return `${item.code.trim().toLocaleLowerCase("ru-RU")}\u0000${item.name.trim().toLocaleLowerCase("ru-RU")}`;
}

export async function prepareBudgetReplacement(
  tx: Prisma.TransactionClient,
  input: { projectId: string; replace: boolean }
) {
  if (!input.replace) return [] as BudgetLink[];
  const activeBaselineCount = await tx.projectControlBaseline.count({
    where: { projectId: input.projectId, status: "active" }
  });
  if (activeBaselineCount > 0) {
    throw new ImportCommitConflict("Нельзя заменить смету при активном контрольном baseline. Сначала создайте новую редакцию baseline или снимите текущую с активности.");
  }
  return tx.budgetItem.findMany({
    where: { projectId: input.projectId },
    select: { id: true, code: true, name: true }
  });
}

export async function relinkScheduleBudgetItems(
  tx: Prisma.TransactionClient,
  input: { projectId: string; previous: BudgetLink[]; created: BudgetLink[] }
) {
  if (!input.previous.length) return { relinked: 0, cleared: 0 };
  const createdByKey = new Map(input.created.map((item) => [budgetKey(item), item.id]));
  let relinked = 0;
  let cleared = 0;
  for (const previous of input.previous) {
    const nextId = createdByKey.get(budgetKey(previous)) ?? null;
    const result = await tx.scheduleItem.updateMany({
      where: { projectId: input.projectId, budgetItemId: previous.id },
      data: { budgetItemId: nextId }
    });
    if (nextId) relinked += result.count;
    else cleared += result.count;
  }
  return { relinked, cleared };
}
