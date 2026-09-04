import { createHash } from "node:crypto";
import type { BudgetItem, DailyReport, Material, Payment, Project, ProjectActionItem, Risk, ScheduleItem } from "@/lib/types";

export type AiControlProposal = {
  id: string;
  sourceKey: string;
  title: string;
  description: string;
  evidence: string;
  sourceModule: string;
  targetTab: string;
  priority: "low" | "medium" | "high" | "critical";
  assignee: string;
  dueAt: string;
  requiresApproval: boolean;
};

export type AiControlPreview = {
  previewId: string;
  generatedAt: string;
  expiresAt: string;
  status: "controlled" | "attention" | "critical" | "no_data";
  summary: string;
  proposals: AiControlProposal[];
  skippedExisting: number;
  dataUsed: string[];
  limitations: string[];
  mutationPolicy: {
    previewWrites: false;
    confirmWrites: "project_actions_only";
    budgetScheduleProcurementDocumentWrites: false;
  };
};

export type AiControlAgentInput = {
  project: Project;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  payments: Payment[];
  dailyReports: DailyReport[];
  risks: Risk[];
  actionItems: Pick<ProjectActionItem, "title" | "sourceModule" | "status">[];
  documentCount: number;
  workforce: {
    overloaded: number;
    shortageHours: number;
    certificationGaps: number;
    headcount: number;
    equipment: number;
  };
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function stableId(sourceKey: string, title: string) {
  return createHash("sha256").update(`${sourceKey}:${normalized(title)}`).digest("hex").slice(0, 16);
}

function dueAt(generatedAt: Date, days: number) {
  const value = new Date(generatedAt);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function proposal(
  generatedAt: Date,
  input: Omit<AiControlProposal, "id" | "dueAt"> & { dueDays: number }
): AiControlProposal {
  return {
    id: stableId(input.sourceKey, input.title),
    sourceKey: input.sourceKey,
    title: input.title,
    description: input.description,
    evidence: input.evidence,
    sourceModule: input.sourceModule,
    targetTab: input.targetTab,
    priority: input.priority,
    assignee: input.assignee,
    dueAt: dueAt(generatedAt, input.dueDays),
    requiresApproval: input.requiresApproval
  };
}

function reportAgeDays(value: string, now: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - parsed.getTime()) / 86400000);
}

export function buildAiControlAgentPreview(input: AiControlAgentInput, generatedAt = new Date()): Omit<AiControlPreview, "previewId"> {
  const candidates: AiControlProposal[] = [];
  const delayed = input.scheduleItems.filter((item) => item.status === "delayed" || item.status === "stopped");
  const deficits = input.materials
    .map((item) => ({ ...item, shortage: Math.max(0, item.requiredQty - item.orderedQty) }))
    .filter((item) => item.shortage > 0)
    .sort((left, right) => right.shortage - left.shortage);
  const overduePayments = input.payments.filter((item) => item.status === "overdue");
  const criticalRisks = input.risks.filter((item) => item.status !== "closed" && (item.priority === "critical" || item.priority === "high"));
  const latestReport = [...input.dailyReports].sort((left, right) => right.date.localeCompare(left.date))[0];
  const latestReportAge = latestReport ? reportAgeDays(latestReport.date, generatedAt) : Number.POSITIVE_INFINITY;

  delayed.slice(0, 4).forEach((item) => candidates.push(proposal(generatedAt, {
    sourceKey: `schedule:${item.id}`,
    title: `Восстановить график: ${item.name}`,
    description: `Подтвердить фронт, ресурсы и зависимые работы. Текущий статус: ${item.status}.`,
    evidence: `${item.actualQty}/${item.plannedQty} ${item.owner ? `· ${item.owner}` : "· ответственный не назначен"}`,
    sourceModule: "AI Control Agent",
    targetTab: "График",
    priority: item.status === "stopped" ? "critical" : "high",
    assignee: item.owner || "РП / ПТО",
    dueDays: item.status === "stopped" ? 1 : 3,
    requiresApproval: true
  })));

  deficits.slice(0, 4).forEach((item) => candidates.push(proposal(generatedAt, {
    sourceKey: `material:${item.id}`,
    title: `Закрыть дефицит: ${item.name}`,
    description: "Проверить остаток, запросить КП и подтвердить дату поставки без автоматического создания закупки.",
    evidence: `Не заказано ${item.shortage} ${item.unit} · нужно к ${item.neededAt}`,
    sourceModule: "AI Control Agent",
    targetTab: "Материалы",
    priority: "high",
    assignee: "Снабжение",
    dueDays: 2,
    requiresApproval: true
  })));

  overduePayments.slice(0, 3).forEach((item) => candidates.push(proposal(generatedAt, {
    sourceKey: `payment:${item.id}`,
    title: `Разобрать просроченный платеж: ${item.title}`,
    description: "Подтвердить фактический статус, приоритет и влияние на cashflow.",
    evidence: `${item.amount} ₽ · ${item.counterparty} · план ${item.plannedAt}`,
    sourceModule: "AI Control Agent",
    targetTab: "Финансы",
    priority: "high",
    assignee: "Финансы / РП",
    dueDays: 2,
    requiresApproval: true
  })));

  criticalRisks.slice(0, 4).forEach((item) => candidates.push(proposal(generatedAt, {
    sourceKey: `risk:${item.id}`,
    title: `Закрыть риск: ${item.title}`,
    description: item.reason,
    evidence: `${item.priority} · владелец ${item.owner || "не назначен"} · срок ${item.dueAt}`,
    sourceModule: "AI Control Agent",
    targetTab: "Риски",
    priority: item.priority,
    assignee: item.owner || "РП",
    dueDays: item.priority === "critical" ? 1 : 3,
    requiresApproval: true
  })));

  if (!latestReport || latestReportAge > 2) {
    candidates.push(proposal(generatedAt, {
      sourceKey: "reports:freshness",
      title: "Обновить рапорт стройплощадки",
      description: "Зафиксировать факт смены: работы, численность, техника, материалы, простои и проблемы.",
      evidence: latestReport ? `Последний рапорт старше ${latestReportAge} дн.` : "Рапортов по проекту нет.",
      sourceModule: "AI Control Agent",
      targetTab: "Рапорты",
      priority: latestReport ? "medium" : "high",
      assignee: "Прораб",
      dueDays: 1,
      requiresApproval: false
    }));
  }

  if (input.workforce.overloaded > 0 || input.workforce.shortageHours > 0) {
    candidates.push(proposal(generatedAt, {
      sourceKey: "workforce:capacity",
      title: "Выровнять ресурсный план",
      description: "Сверить загрузку людей и техники между проектами и подтвердить покрытие плановых часов.",
      evidence: `${input.workforce.overloaded} перегрузок · дефицит ${Math.round(input.workforce.shortageHours)} ч`,
      sourceModule: "AI Control Agent",
      targetTab: "Рапорты",
      priority: input.workforce.overloaded > 0 ? "high" : "medium",
      assignee: "РП / Производство",
      dueDays: 2,
      requiresApproval: true
    }));
  }

  if (input.workforce.certificationGaps > 0) {
    candidates.push(proposal(generatedAt, {
      sourceKey: "workforce:certifications",
      title: "Проверить допуски ресурсного плана",
      description: "Подтвердить обязательные удостоверения и допуски до допуска людей к активным фронтам.",
      evidence: `${input.workforce.certificationGaps} ресурсов без указанных допусков`,
      sourceModule: "AI Control Agent",
      targetTab: "Рапорты",
      priority: "high",
      assignee: "ОТ / РП",
      dueDays: 2,
      requiresApproval: true
    }));
  }

  if (input.documentCount === 0) {
    candidates.push(proposal(generatedAt, {
      sourceKey: "documents:missing",
      title: "Собрать стартовый комплект документов",
      description: "Проверить договор, ВОР, график, рабочую документацию и исполнительный контур.",
      evidence: "В проекте нет загруженных документов.",
      sourceModule: "AI Control Agent",
      targetTab: "Документы",
      priority: "high",
      assignee: "ПТО",
      dueDays: 3,
      requiresApproval: false
    }));
  }

  const existing = new Set(input.actionItems.filter((item) => item.status !== "done").map((item) => normalized(item.title)));
  const proposals = candidates.filter((item) => !existing.has(normalized(item.title))).slice(0, 12);
  const skippedExisting = candidates.length - proposals.length;
  const critical = proposals.filter((item) => item.priority === "critical").length;
  const high = proposals.filter((item) => item.priority === "high").length;
  const evidenceCount = input.budgetItems.length + input.scheduleItems.length + input.materials.length + input.payments.length + input.dailyReports.length + input.risks.length + input.documentCount;
  const status = !evidenceCount && !input.workforce.headcount && !input.workforce.equipment
    ? "no_data" as const
    : critical
      ? "critical" as const
      : high || proposals.length
        ? "attention" as const
        : "controlled" as const;
  const generatedIso = generatedAt.toISOString();

  return {
    generatedAt: generatedIso,
    expiresAt: new Date(generatedAt.getTime() + 30 * 60_000).toISOString(),
    status,
    summary: proposals.length
      ? `Подготовлено ${proposals.length} действий: ${critical} критичных, ${high} высокого приоритета.`
      : "По доступным проверяемым сигналам новых действий не сформировано. Проверьте ограничения и актуальность исходных данных.",
    proposals,
    skippedExisting,
    dataUsed: ["ВОР", "график", "материалы", "платежи", "рапорты", "риски", "документы", "ресурсный план", "реестр действий"],
    limitations: [
      "План строится по данным PGS и не заменяет подтверждение РП, ПТО, финансов и снабжения.",
      "Preview не записывает изменения. Подтверждение создаёт только задачи в Центре действий.",
      "Бюджет, график, закупки, документы и платежи AI Control Agent не изменяет."
    ],
    mutationPolicy: {
      previewWrites: false,
      confirmWrites: "project_actions_only",
      budgetScheduleProcurementDocumentWrites: false
    }
  };
}

export function withAiControlPreviewId(preview: Omit<AiControlPreview, "previewId">): AiControlPreview {
  const previewId = createHash("sha256").update(JSON.stringify({
    generatedAt: preview.generatedAt,
    proposals: preview.proposals,
    status: preview.status
  })).digest("hex");
  return { previewId, ...preview };
}
