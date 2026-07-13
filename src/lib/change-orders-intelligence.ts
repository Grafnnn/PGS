import type { BudgetItem, Material, Payment, ProcurementRequest, Project, Risk, ScheduleItem } from "@/lib/types";

export type ChangeOrderTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ChangeOrderStatus = "no_data" | "review_required" | "controlled";
export type ChangeOrderCategory = "scope" | "price" | "schedule" | "material" | "risk";

export type ChangeOrdersInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  risks?: Risk[] | null;
};

export type ChangeOrdersModel = {
  summary: {
    status: ChangeOrderStatus;
    tone: ChangeOrderTone;
    headline: string;
    nextStep: string;
    candidateCount: number;
    estimatedAmount: number;
    scheduleImpactDays: number;
    contractReviewRequired: boolean;
    unpricedCount: number;
  };
  candidates: Array<{
    id: string;
    title: string;
    category: ChangeOrderCategory;
    source: string;
    rationale: string;
    estimatedAmount: number;
    estimatedDelayDays: number;
    tone: ChangeOrderTone;
    targetTab: "Бюджет / ВОР" | "Договор / Тендер" | "График" | "Материалы" | "Риски" | "КС" | "Финансы";
  }>;
  actions: Array<{
    title: string;
    detail: string;
    ownerRole: "РП" | "ПТО" | "Сметчик" | "Финансовый директор";
    priority: "low" | "medium" | "high";
    targetTab: "Бюджет / ВОР" | "Договор / Тендер" | "График" | "КС" | "Финансы";
  }>;
  limitations: string[];
};

const scopePattern = /доп(?:олнитель|работ)|изменен|variation|extra|дополнит/i;
const riskPattern = /изменен|допработ|заказчик|объем|проектн|проектиров/i;

function round(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function delayedDays(item: ScheduleItem) {
  if (item.status !== "delayed" && item.status !== "stopped") return 0;
  const end = new Date(item.endsAt).getTime();
  if (!Number.isFinite(end)) return 1;
  return Math.max(1, Math.ceil((Date.now() - end) / 86_400_000));
}

function categoryLabel(category: ChangeOrderCategory) {
  return {
    scope: "Изменение объема",
    price: "Изменение цены",
    schedule: "Изменение срока",
    material: "Материальное отклонение",
    risk: "Договорный риск"
  }[category];
}

export function buildChangeOrdersIntelligence(input: ChangeOrdersInput): ChangeOrdersModel {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const risks = input.risks ?? [];
  const candidates: ChangeOrdersModel["candidates"] = [];

  for (const item of budgetItems) {
    const forecastDelta = (item.forecastUnitPrice - item.plannedUnitPrice) * item.qty;
    if (forecastDelta > 0) {
      candidates.push({
        id: `price:${item.id}`,
        title: `Цена выше плана: ${item.name}`,
        category: "price",
        source: item.section || "ВОР",
        rationale: `Forecast-цена выше плановой на ${Math.round(item.forecastUnitPrice - item.plannedUnitPrice).toLocaleString("ru-RU")} ₽ за ${item.unit}.`,
        estimatedAmount: round(forecastDelta),
        estimatedDelayDays: 0,
        tone: forecastDelta > Math.max(item.qty * item.plannedUnitPrice * 0.1, 1) ? "bad" : "warn",
        targetTab: "Бюджет / ВОР"
      });
    }
    if (scopePattern.test(`${item.name} ${item.comment ?? ""} ${item.source}`)) {
      candidates.push({
        id: `scope:${item.id}`,
        title: `Проверить основание: ${item.name}`,
        category: "scope",
        source: item.section || "ВОР",
        rationale: "В строке ВОР отмечены признаки дополнительного объема или изменения исходных данных.",
        estimatedAmount: round(item.qty * Math.max(item.forecastUnitPrice, item.plannedUnitPrice)),
        estimatedDelayDays: 0,
        tone: "warn",
        targetTab: "Договор / Тендер"
      });
    }
  }

  for (const item of scheduleItems) {
    const linkedBudget = item.budgetItemId ? budgetItems.find((budgetItem) => budgetItem.id === item.budgetItemId) : undefined;
    if (item.actualQty > item.plannedQty) {
      const extraQty = item.actualQty - item.plannedQty;
      candidates.push({
        id: `volume:${item.id}`,
        title: `Факт объема выше плана: ${item.name}`,
        category: "scope",
        source: "График / факт работ",
        rationale: `Факт ${extraQty.toLocaleString("ru-RU")} ед. выше планового объема; требуется подтверждение ПТО и заказчика.`,
        estimatedAmount: linkedBudget ? round(extraQty * Math.max(linkedBudget.forecastUnitPrice, linkedBudget.plannedUnitPrice)) : 0,
        estimatedDelayDays: 0,
        tone: linkedBudget ? "warn" : "info",
        targetTab: "График"
      });
    }
    const delay = delayedDays(item);
    if (delay) {
      candidates.push({
        id: `schedule:${item.id}`,
        title: `Сроковое отклонение: ${item.name}`,
        category: "schedule",
        source: "График",
        rationale: `${item.status === "stopped" ? "Работа остановлена" : "Работа просрочена"}; влияние на допсоглашение и cashflow требует оценки.`,
        estimatedAmount: 0,
        estimatedDelayDays: delay,
        tone: item.status === "stopped" ? "bad" : "warn",
        targetTab: "График"
      });
    }
  }

  for (const item of materials) {
    const priceDelta = (item.actualUnitPrice - item.plannedUnitPrice) * Math.max(item.orderedQty, item.deliveredQty, 0);
    if (priceDelta > 0) {
      candidates.push({
        id: `material:${item.id}`,
        title: `Цена материала выше плана: ${item.name}`,
        category: "material",
        source: "Материалы",
        rationale: `Фактическая цена превышает плановую; нужна проверка основания и влияния на ВОР.`,
        estimatedAmount: round(priceDelta),
        estimatedDelayDays: 0,
        tone: "warn",
        targetTab: "Материалы"
      });
    }
  }

  for (const risk of risks) {
    if (risk.status !== "closed" && riskPattern.test(`${risk.title} ${risk.reason}`)) {
      candidates.push({
        id: `risk:${risk.id}`,
        title: `Риск изменения: ${risk.title}`,
        category: "risk",
        source: "Реестр рисков",
        rationale: risk.reason || "Риск требует проверки договорного основания и уведомления заказчика.",
        estimatedAmount: 0,
        estimatedDelayDays: 0,
        tone: risk.priority === "critical" || risk.priority === "high" ? "bad" : "warn",
        targetTab: "Риски"
      });
    }
  }

  const deduplicated = candidates
    .sort((a, b) => (b.tone === "bad" ? 3 : b.tone === "warn" ? 2 : 1) - (a.tone === "bad" ? 3 : a.tone === "warn" ? 2 : 1) || b.estimatedAmount - a.estimatedAmount)
    .slice(0, 12);
  const estimatedAmount = round(deduplicated.reduce((sum, item) => sum + item.estimatedAmount, 0));
  const scheduleImpactDays = deduplicated.reduce((sum, item) => sum + item.estimatedDelayDays, 0);
  const unpricedCount = deduplicated.filter((item) => item.category !== "schedule" && item.estimatedAmount <= 0).length;
  const noData = !project.contractAmount && !budgetItems.length && !scheduleItems.length && !materials.length && !risks.length;
  const severe = deduplicated.some((item) => item.tone === "bad");
  const status: ChangeOrderStatus = noData ? "no_data" : deduplicated.length ? "review_required" : "controlled";
  const tone: ChangeOrderTone = noData ? "info" : severe ? "bad" : deduplicated.length ? "warn" : "good";
  const headline = noData
    ? "Для реестра изменений нужны ВОР, график или риски проекта"
    : deduplicated.length
      ? `${deduplicated.length} кандид. на изменение требуют управленческого review`
      : "Явных кандидатов на допработы и изменения в текущем срезе нет";
  const nextStep = noData
    ? "Загрузить ВОР и график, затем отмечать основания изменения в комментариях и рисках."
    : deduplicated.length
      ? "Подтвердить основание, оценить стоимость и сроки, затем оформить уведомление или проект допсоглашения."
      : "На планерке подтвердить, что новые объемы и изменения фиксируются до выполнения работ.";

  return {
    summary: { status, tone, headline, nextStep, candidateCount: deduplicated.length, estimatedAmount, scheduleImpactDays, contractReviewRequired: deduplicated.some((item) => item.category === "scope" || item.category === "schedule" || item.category === "risk"), unpricedCount },
    candidates: deduplicated.map((item) => ({ ...item, title: `${categoryLabel(item.category)}: ${item.title}` })),
    actions: [
      { title: "Подтвердить основание изменения", detail: `${deduplicated.filter((item) => item.category === "scope" || item.category === "risk").length} позиций требуют позиции заказчика или договора.`, ownerRole: "РП", priority: severe ? "high" : "medium", targetTab: "Договор / Тендер" },
      { title: "Оценить влияние на ВОР и маржу", detail: estimatedAmount ? `Предварительное влияние ${Math.round(estimatedAmount).toLocaleString("ru-RU")} ₽; расчет не является ценой допсоглашения.` : "Нет оцененной суммы: заполнить цены по кандидатам.", ownerRole: "Сметчик", priority: estimatedAmount ? "high" : "medium", targetTab: "Бюджет / ВОР" },
      { title: "Проверить сроковое влияние", detail: scheduleImpactDays ? `Зафиксировано ${scheduleImpactDays} дн. отклонений в графике.` : "Сроковые отклонения в текущем срезе не выявлены.", ownerRole: "ПТО", priority: scheduleImpactDays ? "high" : "low", targetTab: "График" },
      { title: "Подготовить пакет к КС и cashflow", detail: "Включать подтвержденные изменения только после решения заказчика и обновления договорных оснований.", ownerRole: "Финансовый директор", priority: deduplicated.length ? "medium" : "low", targetTab: "КС" }
    ],
    limitations: [
      "v1 формирует только кандидатов на изменение. Он не создает допсоглашение, КС, счет или новую строку ВОР.",
      "Предварительная сумма не заменяет сметный расчет, договорную процедуру и письменное согласование заказчика.",
      "Перед включением в cashflow или КС подтвердите объем, цену, срок и доказательства изменения отдельным решением."
    ]
  };
}
