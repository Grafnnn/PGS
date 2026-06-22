import type { BudgetItem } from "@/lib/types";
import type { BudgetIntelligence, IntelligenceIssue } from "./types";
import { evidence, issue, normalizeName } from "./helpers";

function itemAmount(item: BudgetItem) {
  return item.qty * item.plannedUnitPrice;
}

function expectedAmountFromComment(comment?: string) {
  const match = comment?.match(/(?:сумма|total)\s*[:=]\s*([\d\s.,]+)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function analyzeBudget(items: BudgetItem[], contractAmount: number): BudgetIntelligence {
  const issues: IntelligenceIssue[] = [];
  const missingPriceItems = items.filter((item) => item.plannedUnitPrice <= 0);
  const zeroQuantityItems = items.filter((item) => item.qty <= 0);
  const totalPlanned = items.reduce((sum, item) => sum + itemAmount(item), 0);

  for (const item of missingPriceItems) {
    issues.push(
      issue({
        id: `budget-missing-price-${item.id}`,
        category: "budget",
        title: "Позиция без цены",
        reason: `${item.name} не имеет плановой цены.`,
        score: 65,
        suggestedAction: "Проверьте цену и источник стоимости до утверждения бюджета.",
        evidence: [
          evidence({
            entityType: "budgetItem",
            entityId: item.id,
            label: item.name,
            field: "plannedUnitPrice",
            value: item.plannedUnitPrice,
            explanation: "Нулевая цена искажает себестоимость и маржинальность."
          })
        ]
      })
    );
  }

  for (const item of zeroQuantityItems) {
    issues.push(
      issue({
        id: `budget-zero-qty-${item.id}`,
        category: "budget",
        title: "Позиция без количества",
        reason: `${item.name} имеет нулевой объем.`,
        score: 60,
        suggestedAction: "Уточните объем или исключите позицию из рабочего бюджета.",
        evidence: [
          evidence({
            entityType: "budgetItem",
            entityId: item.id,
            label: item.name,
            field: "qty",
            value: item.qty,
            explanation: "Нулевой объем делает сумму позиции равной нулю."
          })
        ]
      })
    );
  }

  const duplicateItems: IntelligenceIssue[] = [];
  const seen = new Map<string, BudgetItem>();
  for (const item of items) {
    const key = `${normalizeName(item.section)}|${normalizeName(item.name)}|${normalizeName(item.unit)}`;
    const duplicate = seen.get(key);
    if (!duplicate) {
      seen.set(key, item);
      continue;
    }
    const duplicateIssue = issue({
      id: `budget-duplicate-${item.id}`,
      category: "budget",
      title: "Возможный дубль позиции",
      reason: `${item.name} повторяется в разделе ${item.section}.`,
      score: 55,
      suggestedAction: "Сверьте позиции и удалите дубль либо разделите объемы.",
      evidence: [
        evidence({
          entityType: "budgetItem",
          entityId: duplicate.id,
          label: duplicate.name,
          explanation: "Первая похожая позиция."
        }),
        evidence({
          entityType: "budgetItem",
          entityId: item.id,
          label: item.name,
          explanation: "Повторяющаяся позиция с тем же названием и единицей."
        })
      ]
    });
    duplicateItems.push(duplicateIssue);
    issues.push(duplicateIssue);
  }

  const amountMismatches = items
    .map((item) => ({ item, expected: expectedAmountFromComment(item.comment) }))
    .filter((entry): entry is { item: BudgetItem; expected: number } => entry.expected !== null)
    .filter(({ item, expected }) => Math.abs(itemAmount(item) - expected) > Math.max(1, expected * 0.01))
    .map(({ item, expected }) =>
      issue({
        id: `budget-amount-mismatch-${item.id}`,
        category: "budget",
        title: "Расхождение суммы позиции",
        reason: `${item.name}: количество * цена отличается от суммы в примечании.`,
        score: 60,
        suggestedAction: "Проверьте исходную смету и корректность цены/объема.",
        evidence: [
          evidence({
            entityType: "budgetItem",
            entityId: item.id,
            label: item.name,
            field: "qty * plannedUnitPrice",
            value: itemAmount(item),
            explanation: `Расчетная сумма ${itemAmount(item)}, ожидаемая сумма ${expected}.`
          })
        ]
      })
    );
  issues.push(...amountMismatches);

  const topCostItems = [...items]
    .map((item) => ({
      id: item.id,
      name: item.name,
      section: item.section,
      amount: itemAmount(item),
      sharePercent: totalPlanned ? (itemAmount(item) / totalPlanned) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const topItem = topCostItems[0];
  if (topItem && topItem.sharePercent >= 40) {
    issues.push(
      issue({
        id: `budget-top-concentration-${topItem.id}`,
        category: "budget",
        title: "Высокая концентрация бюджета",
        reason: `${topItem.name} занимает ${topItem.sharePercent.toFixed(1)}% плановой себестоимости.`,
        score: topItem.sharePercent >= 60 ? 75 : 55,
        suggestedAction: "Проверьте цену, объем и договорные условия по крупнейшей позиции.",
        evidence: [
          evidence({
            entityType: "budgetItem",
            entityId: topItem.id,
            label: topItem.name,
            value: topItem.sharePercent.toFixed(1),
            explanation: "Крупнейшая позиция сильно влияет на маржинальность."
          })
        ]
      })
    );
  }

  if (totalPlanned > contractAmount && contractAmount > 0) {
    issues.push(
      issue({
        id: "budget-over-contract",
        category: "budget",
        title: "Плановая себестоимость выше договора",
        reason: "Сумма плановой себестоимости превышает договорную сумму.",
        score: 85,
        suggestedAction: "Проверьте договорную цену, бюджет и возможность допсоглашения.",
        evidence: [
          evidence({
            entityType: "project",
            label: "Договорная сумма",
            field: "contractAmount",
            value: contractAmount,
            explanation: `Плановая себестоимость: ${totalPlanned}.`
          })
        ]
      })
    );
  }

  const workTotal = items.filter((item) => item.kind === "work").reduce((sum, item) => sum + itemAmount(item), 0);
  const materialTotal = items.filter((item) => item.kind === "material").reduce((sum, item) => sum + itemAmount(item), 0);

  return {
    topCostItems,
    missingPriceItems,
    zeroQuantityItems,
    amountMismatches,
    duplicateItems,
    materialSharePercent: totalPlanned ? (materialTotal / totalPlanned) * 100 : 0,
    workSharePercent: totalPlanned ? (workTotal / totalPlanned) * 100 : 0,
    importWarnings: [],
    issues
  };
}
