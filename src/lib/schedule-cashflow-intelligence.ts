import { buildProcurementIntelligenceModel, type ProcurementImportHistoryItem } from "@/lib/procurement-intelligence";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ScheduleItem } from "@/lib/types";

export type ScheduleCashflowTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ScheduleCashflowStatus = "needs_import" | "needs_review" | "draft_ready" | "blocked" | "scheduled";

export type ScheduleCashflowImportHistoryItem = ProcurementImportHistoryItem;

export type WorkPackageView = {
  id: string;
  section: string;
  category: string;
  rowCount: number;
  workAmount: number;
  materialAmount: number;
  totalAmount: number;
  suggestedDurationDays: number;
  suggestedCrew: string;
  readiness: "ready" | "needs_quantity" | "needs_price" | "needs_materials" | "unknown";
  blockers: string[];
  dependencies: string[];
  confidence: number;
};

export type TimelineWeekView = {
  week: number;
  label: string;
  packages: string[];
  workAmount: number;
  materialAmount: number;
  totalAmount: number;
  blockers: string[];
  tone: ScheduleCashflowTone;
};

export type CashflowWeekView = {
  week: number;
  label: string;
  incomingPlanned: number;
  outgoingPlanned: number;
  workCost: number;
  materialCost: number;
  net: number;
  cumulative: number;
  tone: ScheduleCashflowTone;
};

export type ScheduleRiskSignal = {
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export type ExecutiveWeeklyPlan = {
  thisWeekFocus: string[];
  nextWeekFocus: string[];
  procurementActions: string[];
  financeCashNeeds: string[];
  risks: string[];
  recommendedNextActions: string[];
  draftText: string;
};

export type ScheduleCashflowIntelligenceModel = {
  status: ScheduleCashflowStatus;
  tone: ScheduleCashflowTone;
  summary: {
    packageCount: number;
    readyPackages: number;
    blockedPackages: number;
    unknownRows: number;
    totalWorkAmount: number;
    totalMaterialAmount: number;
    totalAmount: number;
    peakCashWeek: string;
    peakCashNeed: number;
    scheduleWeeks: number;
    procurementDependencies: number;
  };
  readiness: {
    label: string;
    nextStep: string;
    blockers: string[];
  };
  packages: WorkPackageView[];
  timeline: TimelineWeekView[];
  cashflow: CashflowWeekView[];
  risks: ScheduleRiskSignal[];
  executivePlan: ExecutiveWeeklyPlan;
};

export type ScheduleCashflowIntelligenceInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  importHistory?: ScheduleCashflowImportHistoryItem[] | null;
  today?: string;
};

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function round(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function amount(item: BudgetItem) {
  return Math.max(item.qty, 0) * Math.max(item.plannedUnitPrice, 0);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function weekLabel(projectStart: string | undefined, week: number) {
  const start = projectStart ? new Date(projectStart) : null;
  if (!start || Number.isNaN(start.getTime())) return `Неделя ${week}`;
  const weekStart = addDays(start, (week - 1) * 7);
  const weekEnd = addDays(weekStart, 6);
  return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
}

function latestImport(importHistory: ScheduleCashflowImportHistoryItem[] = []) {
  return importHistory.find((item) => item.status === "committed" && item.preview) ?? importHistory.find((item) => item.preview);
}

function budgetRowsFromImport(importBatch: ScheduleCashflowImportHistoryItem | undefined): BudgetItem[] {
  return (importBatch?.preview?.previewRows ?? [])
    .filter((row) => row.entityType === "budgetItem")
    .map((row, index) => ({
      id: row.id ?? `preview-budget-${index + 1}`,
      projectId: "preview",
      section: row.section ?? "Без раздела",
      code: "",
      name: row.name ?? "Строка ВОР",
      unit: row.unit ?? "",
      qty: row.quantity ?? 0,
      plannedUnitPrice: row.unitPrice ?? 0,
      actualUnitPrice: 0,
      forecastUnitPrice: row.unitPrice ?? 0,
      kind: row.entityType === "material" ? "material" : "work",
      source: "import-preview",
      comment: row.warnings.join("; ")
    }));
}

function packageCategory(section: string, rows: BudgetItem[]) {
  const value = normalize(`${section} ${rows.map((row) => row.name).join(" ")}`);
  if (/демонтаж|разбор|снос/.test(value)) return "Демонтаж";
  if (/землян|котлован|грунт|песок|щеб/.test(value)) return "Земляные работы";
  if (/монолит|бетон|армат|фундамент|перекрыт|колонн/.test(value)) return "Монолит";
  if (/труб|пнд|канал|вод|сети|кабель|электр/.test(value)) return "Инженерные сети";
  if (/кров|гидро|изоляц|мембран/.test(value)) return "Кровля и изоляция";
  if (/отдел|штукатур|плитк|краск|гкл/.test(value)) return "Отделка";
  if (/поставка|материал|комплект/.test(value)) return "Снабжение";
  return "Общестрой";
}

function crewHint(category: string) {
  if (category === "Земляные работы") return "Прораб + машинист + 2-4 рабочих";
  if (category === "Монолит") return "ПТО + монолитная бригада 6-10 человек";
  if (category === "Инженерные сети") return "ИТР + профильная монтажная бригада";
  if (category === "Кровля и изоляция") return "Мастер + звено кровельщиков";
  if (category === "Отделка") return "Мастер + отделочная бригада";
  if (category === "Демонтаж") return "Мастер + звено демонтажа";
  return "РП + ПТО должны назначить ответственного";
}

function durationDays(category: string, rows: BudgetItem[]) {
  const base = Math.ceil(rows.length * 2.2);
  const categoryMin: Record<string, number> = {
    Демонтаж: 3,
    "Земляные работы": 5,
    Монолит: 10,
    "Инженерные сети": 7,
    "Кровля и изоляция": 5,
    Отделка: 8,
    Снабжение: 3,
    Общестрой: 5
  };
  return Math.max(categoryMin[category] ?? 5, Math.min(35, base));
}

function materialDependency(section: string, materials: Material[], procurementRequests: ProcurementRequest[]) {
  const sectionValue = normalize(section);
  const activeRequestKeys = new Set(
    procurementRequests
      .filter((request) => !["closed", "rejected"].includes(request.status))
      .flatMap((request) => request.items.map((item) => normalize(item.name)))
  );
  return materials.filter((material) => {
    const name = normalize(material.name);
    const categoryHit =
      (/монолит|фундамент|перекрыт/.test(sectionValue) && /бетон|армат/.test(name)) ||
      (/землян|котлован/.test(sectionValue) && /песок|щеб|грунт/.test(name)) ||
      (/сети|труб|канал|вод/.test(sectionValue) && /труб|пнд|фитинг|канал/.test(name)) ||
      (/электр|кабель/.test(sectionValue) && /кабель|щит|электр/.test(name)) ||
      (/кров|изоляц/.test(sectionValue) && /гидро|мембран|утепл|кров/.test(name)) ||
      (/отдел/.test(sectionValue) && /краск|плитк|гкл|смес|грунт/.test(name));
    const deficit = material.requiredQty > Math.max(material.orderedQty, material.deliveredQty);
    return categoryHit && deficit && !activeRequestKeys.has(name);
  });
}

function buildPackages(input: Required<Pick<ScheduleCashflowIntelligenceInput, "budgetItems" | "materials" | "procurementRequests">>) {
  const workRows = (input.budgetItems ?? []).filter((item) => item.kind !== "material");
  const sections = new Map<string, BudgetItem[]>();
  for (const row of workRows) {
    const key = row.section?.trim() || "Без раздела";
    sections.set(key, [...(sections.get(key) ?? []), row]);
  }

  return Array.from(sections.entries()).map(([section, rows], index) => {
    const category = packageCategory(section, rows);
    const workAmount = rows.filter((item) => item.kind !== "material").reduce((sum, item) => sum + amount(item), 0);
    const relatedMaterials = (input.budgetItems ?? []).filter((item) => item.kind === "material" && normalize(item.section) === normalize(section));
    const materialAmount = relatedMaterials.reduce((sum, item) => sum + amount(item), 0);
    const missingQuantity = rows.filter((item) => item.qty <= 0).length;
    const missingPrice = rows.filter((item) => item.plannedUnitPrice <= 0).length + relatedMaterials.filter((item) => item.plannedUnitPrice <= 0).length;
    const missingMaterials = materialDependency(section, input.materials ?? [], input.procurementRequests ?? []);
    const blockers = [
      ...(missingQuantity ? [`${missingQuantity} строк без количества`] : []),
      ...(missingPrice ? [`${missingPrice} строк без цены`] : []),
      ...(missingMaterials.length ? [`${missingMaterials.length} материальных зависимостей без заявки`] : [])
    ];
    const readiness: WorkPackageView["readiness"] = missingQuantity
      ? "needs_quantity"
      : missingPrice
        ? "needs_price"
        : missingMaterials.length
          ? "needs_materials"
          : section === "Без раздела"
            ? "unknown"
            : "ready";

    return {
      id: `package-${index + 1}-${normalize(section).replace(/\W+/g, "-") || "section"}`,
      section,
      category,
      rowCount: rows.length + relatedMaterials.length,
      workAmount: round(workAmount),
      materialAmount: round(materialAmount),
      totalAmount: round(workAmount + materialAmount),
      suggestedDurationDays: durationDays(category, rows),
      suggestedCrew: crewHint(category),
      readiness,
      blockers,
      dependencies: missingMaterials.slice(0, 4).map((material) => material.name),
      confidence: blockers.length ? 0.62 : 0.86
    } satisfies WorkPackageView;
  });
}

function buildDraftTimeline(packages: WorkPackageView[], projectStart?: string) {
  let cursorWeek = 1;
  const weeks: TimelineWeekView[] = [];
  for (const item of packages) {
    const weeksForPackage = Math.max(1, Math.ceil(item.suggestedDurationDays / 7));
    for (let offset = 0; offset < weeksForPackage; offset += 1) {
      const week = cursorWeek + offset;
      const existing =
        weeks.find((entry) => entry.week === week) ??
        ({
          week,
          label: weekLabel(projectStart, week),
          packages: [],
          workAmount: 0,
          materialAmount: 0,
          totalAmount: 0,
          blockers: [],
          tone: "info"
        } satisfies TimelineWeekView);
      existing.packages.push(item.section);
      existing.workAmount += item.workAmount / weeksForPackage;
      existing.materialAmount += item.materialAmount / weeksForPackage;
      existing.totalAmount += item.totalAmount / weeksForPackage;
      existing.blockers.push(...item.blockers);
      existing.tone = existing.blockers.length ? "warn" : "info";
      if (!weeks.some((entry) => entry.week === week)) weeks.push(existing);
    }
    cursorWeek += weeksForPackage;
  }
  return weeks.map((entry) => ({
    ...entry,
    workAmount: round(entry.workAmount),
    materialAmount: round(entry.materialAmount),
    totalAmount: round(entry.totalAmount),
    blockers: Array.from(new Set(entry.blockers)).slice(0, 4)
  }));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function dateTime(value?: string) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function importedScheduleSection(dependency?: string) {
  const section = dependency?.split(" · ")[0]?.trim() ?? "";
  if (/^раздел(?:\s|$)/iu.test(section)) return section;
  const gprStage = section.replace(/^этап\s+гпр\s*:\s*/iu, "").trim();
  if (!gprStage || gprStage === section) return "";
  if (/^раздел(?:\s|$)/iu.test(gprStage)) return gprStage;
  const numberedStage = gprStage.match(/^(\d+(?:[.,]\d+)*)[.)]?\s*(.*)$/u);
  return numberedStage ? `Раздел ${numberedStage[1]}${numberedStage[2] ? `. ${numberedStage[2]}` : ""}` : gprStage;
}

function sectionKey(section: string) {
  const number = section.match(/^раздел\s+(\d+(?:[.,]\d+)*)/iu)?.[1]?.replace(",", ".");
  return number ? `section:${number}` : normalize(section);
}

function scheduleSection(item: ScheduleItem, budgetById: Map<string, BudgetItem>) {
  const linkedSection = item.budgetItemId ? budgetById.get(item.budgetItemId)?.section?.trim() : "";
  return linkedSection || importedScheduleSection(item.dependency);
}

function scheduleAnchor(scheduleItems: ScheduleItem[], fallback?: string) {
  const earliest = scheduleItems
    .filter((item) => Number.isFinite(dateTime(item.startsAt)))
    .slice()
    .sort((left, right) => dateTime(left.startsAt) - dateTime(right.startsAt))[0];
  return earliest?.startsAt ?? fallback;
}

function weekIndex(value: string | undefined, anchor: string | undefined) {
  const time = dateTime(value);
  const anchorTime = dateTime(anchor);
  if (!Number.isFinite(time) || !Number.isFinite(anchorTime)) return null;
  return Math.max(1, Math.floor((time - anchorTime) / WEEK_MS) + 1);
}

function weeklyPlan(dependency?: string) {
  const weeks = new Map<number, number>();
  const pattern = /[нn]\s*(\d{1,2})\s+([\d\s.,]+)\s*₽/giu;
  for (const match of dependency?.matchAll(pattern) ?? []) {
    const week = Number(match[1]);
    const value = Number(match[2].replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(week) || week < 1 || !Number.isFinite(value) || value <= 0) continue;
    weeks.set(week, (weeks.get(week) ?? 0) + value);
  }
  return weeks;
}

function buildTimeline(
  packages: WorkPackageView[],
  projectStart: string | undefined,
  scheduleItems: ScheduleItem[],
  budgetItems: BudgetItem[]
) {
  const budgetById = new Map(budgetItems.map((item) => [item.id, item]));
  const scheduledBySection = new Map<string, ScheduleItem[]>();
  for (const item of scheduleItems) {
    if (!Number.isFinite(dateTime(item.startsAt)) || !Number.isFinite(dateTime(item.endsAt))) continue;
    const section = scheduleSection(item, budgetById);
    if (!section) continue;
    const key = sectionKey(section);
    scheduledBySection.set(key, [...(scheduledBySection.get(key) ?? []), item]);
  }

  const matchedPackages = packages.filter((item) => scheduledBySection.has(sectionKey(item.section)));
  if (!matchedPackages.length) return buildDraftTimeline(packages, projectStart);

  const weeks = new Map<number, TimelineWeekView>();
  const addAllocation = (item: WorkPackageView, week: number, share: number) => {
    const existing = weeks.get(week) ?? {
      week,
      label: weekLabel(projectStart, week),
      packages: [],
      workAmount: 0,
      materialAmount: 0,
      totalAmount: 0,
      blockers: [],
      tone: "info" as const
    };
    if (!existing.packages.includes(item.section)) existing.packages.push(item.section);
    existing.workAmount += item.workAmount * share;
    existing.materialAmount += item.materialAmount * share;
    existing.totalAmount += item.totalAmount * share;
    existing.blockers.push(...item.blockers);
    existing.tone = existing.blockers.length ? "warn" : "info";
    weeks.set(week, existing);
  };

  const unscheduled: WorkPackageView[] = [];
  for (const item of packages) {
    const scheduled = scheduledBySection.get(sectionKey(item.section)) ?? [];
    if (!scheduled.length) {
      unscheduled.push(item);
      continue;
    }

    const planned = new Map<number, number>();
    for (const scheduleItem of scheduled) {
      for (const [week, value] of weeklyPlan(scheduleItem.dependency)) {
        planned.set(week, (planned.get(week) ?? 0) + value);
      }
    }
    const plannedTotal = Array.from(planned.values()).reduce((sum, value) => sum + value, 0);
    if (plannedTotal > 0) {
      for (const [week, value] of planned) addAllocation(item, week, value / plannedTotal);
      continue;
    }

    const starts = scheduled.map((entry) => weekIndex(entry.startsAt, projectStart)).filter((value): value is number => value !== null);
    const ends = scheduled.map((entry) => weekIndex(entry.endsAt, projectStart)).filter((value): value is number => value !== null);
    const firstWeek = starts.length ? Math.min(...starts) : 1;
    const lastWeek = ends.length ? Math.max(...ends) : firstWeek;
    const duration = Math.max(1, lastWeek - firstWeek + 1);
    for (let week = firstWeek; week <= lastWeek; week += 1) addAllocation(item, week, 1 / duration);
  }

  let cursorWeek = Math.max(0, ...weeks.keys()) + 1;
  for (const item of unscheduled) {
    const duration = Math.max(1, Math.ceil(item.suggestedDurationDays / 7));
    for (let offset = 0; offset < duration; offset += 1) addAllocation(item, cursorWeek + offset, 1 / duration);
    cursorWeek += duration;
  }

  return Array.from(weeks.values())
    .sort((left, right) => left.week - right.week)
    .map((entry) => ({
      ...entry,
      workAmount: round(entry.workAmount),
      materialAmount: round(entry.materialAmount),
      totalAmount: round(entry.totalAmount),
      blockers: Array.from(new Set(entry.blockers)).slice(0, 4)
    }));
}

function paymentWeek(plannedAt: string | undefined, projectStart: string | undefined) {
  if (!plannedAt || !projectStart) return null;
  const planned = new Date(plannedAt);
  const start = new Date(projectStart);
  if (Number.isNaN(planned.getTime()) || Number.isNaN(start.getTime())) return null;
  return Math.max(1, Math.floor((planned.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function buildCashflow(timeline: TimelineWeekView[], payments: Payment[], projectStart?: string) {
  let cumulative = 0;
  return timeline.map((week) => {
    const incomingPlanned = payments
      .filter((payment) => payment.direction === "incoming" && payment.status !== "paid" && paymentWeek(payment.plannedAt, projectStart) === week.week)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const outgoingPlanned = week.totalAmount;
    const net = incomingPlanned - outgoingPlanned;
    cumulative += net;
    return {
      week: week.week,
      label: week.label,
      incomingPlanned: round(incomingPlanned),
      outgoingPlanned: round(outgoingPlanned),
      workCost: week.workAmount,
      materialCost: week.materialAmount,
      net: round(net),
      cumulative: round(cumulative),
      tone: cumulative < 0 ? "bad" : net < 0 ? "warn" : "good"
    } satisfies CashflowWeekView;
  });
}

function buildRisks(packages: WorkPackageView[], timeline: TimelineWeekView[], cashflow: CashflowWeekView[], scheduleItems: ScheduleItem[], unknownRows: number): ScheduleRiskSignal[] {
  const risks: ScheduleRiskSignal[] = [];
  const blocked = packages.filter((item) => item.readiness !== "ready");
  if (!scheduleItems.length && packages.length) {
    risks.push({ severity: "high", title: "График не подтвержден", detail: "Пакеты работ построены как draft из ВОР; нужны даты, ответственные и зависимости." });
  }
  if (blocked.length) {
    risks.push({ severity: "high", title: "Есть блокеры перед календаризацией", detail: `${blocked.length} пакетов требуют цены, количества или материалов.` });
  }
  const negativeWeeks = cashflow.filter((week) => week.cumulative < 0);
  if (negativeWeeks.length) {
    risks.push({ severity: "medium", title: "Потребность в финансировании", detail: `Накопительный cashflow уходит в минус на ${negativeWeeks.length} неделях.` });
  }
  if (unknownRows) {
    risks.push({ severity: "medium", title: "Unknown строки импорта", detail: `${unknownRows} строк не участвуют в графике и cashflow до ручной классификации.` });
  }
  if (!timeline.length) {
    risks.push({ severity: "low", title: "Нет основы для недельного плана", detail: "Загрузите или заполните ВОР, чтобы построить пакеты работ." });
  }
  return risks;
}

function buildExecutivePlan(packages: WorkPackageView[], cashflow: CashflowWeekView[], risks: ScheduleRiskSignal[]) {
  const firstReady = packages.filter((item) => item.readiness === "ready").slice(0, 3);
  const blocked = packages.filter((item) => item.readiness !== "ready").slice(0, 3);
  const peakNeed = cashflow.slice().sort((left, right) => left.cumulative - right.cumulative)[0];
  const procurementActions = packages
    .filter((item) => item.dependencies.length)
    .slice(0, 3)
    .map((item) => `${item.section}: закрыть ${item.dependencies.join(", ")}`);
  const nextActions = [
    blocked.length ? "Закрыть блокеры по ценам, объемам и материалам до commit графика." : "Проверить draft-график и назначить ответственных.",
    peakNeed && peakNeed.cumulative < 0 ? `Подтвердить финансирование на ${peakNeed.label}.` : "Сверить cashflow с условиями договора и платежным календарем.",
    "После проверки выполнить явный preview/commit через штатные кнопки."
  ];

  const draftText = [
    "Управленческий план на неделю:",
    firstReady.length ? `В работу можно планировать: ${firstReady.map((item) => item.section).join(", ")}.` : "Нет полностью готовых пакетов работ.",
    blocked.length ? `Блокеры: ${blocked.map((item) => `${item.section} (${item.blockers.join("; ")})`).join("; ")}.` : "Критичных блокеров по пакетам не выявлено.",
    peakNeed && peakNeed.cumulative < 0 ? `Cashflow: пик потребности ${Math.abs(peakNeed.cumulative).toLocaleString("ru-RU")} ₽ на ${peakNeed.label}.` : "Cashflow: критичного минуса по черновому недельному плану не выявлено."
  ].join(" ");

  return {
    thisWeekFocus: firstReady.map((item) => item.section),
    nextWeekFocus: packages.slice(firstReady.length, firstReady.length + 3).map((item) => item.section),
    procurementActions,
    financeCashNeeds: peakNeed && peakNeed.cumulative < 0 ? [`${peakNeed.label}: покрыть ${Math.abs(peakNeed.cumulative).toLocaleString("ru-RU")} ₽`] : ["Проверить входящие платежи и авансы по договору."],
    risks: risks.slice(0, 4).map((risk) => `${risk.title}: ${risk.detail}`),
    recommendedNextActions: nextActions,
    draftText
  } satisfies ExecutiveWeeklyPlan;
}

export function buildScheduleCashflowIntelligenceModel(input: ScheduleCashflowIntelligenceInput): ScheduleCashflowIntelligenceModel {
  const project = input.project ?? {};
  const importBatch = latestImport(input.importHistory ?? []);
  const budgetItems = (input.budgetItems?.length ? input.budgetItems : budgetRowsFromImport(importBatch)) ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const payments = input.payments ?? [];
  const importHistory = input.importHistory ?? [];
  const unknownRows = (importBatch?.preview?.unknownRows?.length ?? 0) + (importBatch?.preview?.previewRows?.filter((row) => row.entityType === "unknown").length ?? 0);
  const procurement = buildProcurementIntelligenceModel({
    projectName: project.name ?? "Проект",
    materials,
    procurementRequests,
    importHistory
  });
  const packages = buildPackages({ budgetItems, materials, procurementRequests });
  const timelineStart = scheduleAnchor(scheduleItems, project.startsAt);
  const timeline = buildTimeline(packages, timelineStart, scheduleItems, budgetItems);
  const cashflow = buildCashflow(timeline, payments, timelineStart);
  const risks = buildRisks(packages, timeline, cashflow, scheduleItems, unknownRows);
  const executivePlan = buildExecutivePlan(packages, cashflow, risks);
  const blockedPackages = packages.filter((item) => item.readiness !== "ready").length;
  const readyPackages = packages.filter((item) => item.readiness === "ready").length;
  const peak = cashflow.slice().sort((left, right) => left.cumulative - right.cumulative)[0] ?? null;
  const procurementDependencies = packages.filter((item) => item.dependencies.length).length + procurement.summary.candidates;

  const status: ScheduleCashflowStatus = !budgetItems.length
    ? "needs_import"
    : blockedPackages
      ? "blocked"
      : !scheduleItems.length
        ? "draft_ready"
        : "scheduled";
  const tone: ScheduleCashflowTone = status === "scheduled" ? "good" : status === "blocked" ? "bad" : status === "draft_ready" ? "warn" : "info";
  const blockers = [
    ...(blockedPackages ? [`${blockedPackages} пакетов не готовы к календаризации`] : []),
    ...(unknownRows ? [`${unknownRows} unknown строк импорта требуют классификации`] : []),
    ...(peak && peak.cumulative < 0 ? [`Пик потребности в финансировании: ${Math.abs(peak.cumulative).toLocaleString("ru-RU")} ₽`] : [])
  ];

  return {
    status,
    tone,
    summary: {
      packageCount: packages.length,
      readyPackages,
      blockedPackages,
      unknownRows,
      totalWorkAmount: round(packages.reduce((sum, item) => sum + item.workAmount, 0)),
      totalMaterialAmount: round(packages.reduce((sum, item) => sum + item.materialAmount, 0)),
      totalAmount: round(packages.reduce((sum, item) => sum + item.totalAmount, 0)),
      peakCashWeek: peak?.label ?? "нет данных",
      peakCashNeed: peak && peak.cumulative < 0 ? round(Math.abs(peak.cumulative)) : 0,
      scheduleWeeks: timeline.length,
      procurementDependencies
    },
    readiness: {
      label: status === "needs_import" ? "Нужен ВОР" : status === "blocked" ? "Есть блокеры" : status === "draft_ready" ? "Готов к draft" : "График есть",
      nextStep: status === "needs_import" ? "Загрузите ВОР или заполните бюджет." : status === "blocked" ? "Закройте блокеры до commit графика/cashflow." : "Проверьте preview и выполните явный commit при готовности.",
      blockers
    },
    packages,
    timeline,
    cashflow,
    risks,
    executivePlan
  };
}
