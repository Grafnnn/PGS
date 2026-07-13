import { buildChangeOrdersIntelligence } from "@/lib/change-orders-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type ClaimsNoticesTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ClaimsNoticesStatus = "no_data" | "needs_review" | "controlled";
export type NoticeKind = "change_notice" | "delay_notice" | "evidence_request" | "claim_candidate";
export type NoticeReadiness = "needs_contract_review" | "needs_evidence" | "draft_ready";

export type ClaimsNoticesInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  documentChecklist?: DocumentChecklistItem[] | null;
};

export type ClaimsNoticesModel = {
  summary: {
    status: ClaimsNoticesStatus;
    tone: ClaimsNoticesTone;
    headline: string;
    nextStep: string;
    noticeCount: number;
    urgentCount: number;
    estimatedAmount: number;
    scheduleImpactDays: number;
    evidenceDocuments: number;
    contractReviewRequired: boolean;
  };
  notices: Array<{
    id: string;
    kind: NoticeKind;
    title: string;
    trigger: string;
    recipient: string;
    readiness: NoticeReadiness;
    priority: "medium" | "high" | "urgent";
    estimatedAmount: number;
    estimatedDelayDays: number;
    evidence: string[];
    targetTab: "Договор / Тендер" | "Бюджет / ВОР" | "График" | "Документы" | "Риски" | "КС";
    draftText: string;
  }>;
  actions: Array<{
    title: string;
    detail: string;
    ownerRole: "РП" | "ПТО" | "Юрист" | "Сметчик";
    priority: "low" | "medium" | "high";
    targetTab: "Договор / Тендер" | "Документы" | "Бюджет / ВОР" | "График" | "Риски";
  }>;
  limitations: string[];
};

const evidencePattern = /акт|письм|переписк|уведом|фото|рапорт|предпис|согласован|протокол/i;
const customerChangePattern = /заказчик|проектн|изменен|допработ|объем|объём|согласован/i;

function money(value: number) {
  return Math.round(value).toLocaleString("ru-RU") + " ₽";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function kindLabel(kind: NoticeKind) {
  return { change_notice: "Уведомление об изменении", delay_notice: "Уведомление о сроковом влиянии", evidence_request: "Запрос доказательств", claim_candidate: "Кандидат на претензию" }[kind];
}

export function buildClaimsNoticesIntelligence(input: ClaimsNoticesInput): ClaimsNoticesModel {
  const project = input.project ?? {};
  const documents = input.documents ?? [];
  const checklist = input.documentChecklist ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const risks = input.risks ?? [];
  const changeOrders = buildChangeOrdersIntelligence(input);
  const evidenceDocuments = documents.filter((document) => evidencePattern.test(`${document.title} ${document.category} ${document.fileName ?? ""} ${document.comment ?? ""}`));
  const checklistEvidence = checklist.filter((item) => item.status === "present" && evidencePattern.test(item.title));
  const evidenceLabels = unique([
    ...evidenceDocuments.slice(0, 4).map((document) => document.title),
    ...checklistEvidence.slice(0, 3).map((item) => item.title)
  ]);
  const baseEvidence = evidenceLabels.length ? evidenceLabels : ["Нужно приложить рапорт, переписку, акт или согласованную редакцию исходных данных."];
  const notices: ClaimsNoticesModel["notices"] = [];

  for (const candidate of changeOrders.candidates) {
    if (candidate.category !== "scope" && candidate.category !== "price" && candidate.category !== "material" && candidate.category !== "risk") continue;
    const kind: NoticeKind = candidate.category === "risk" ? "claim_candidate" : "change_notice";
    const readiness: NoticeReadiness = evidenceLabels.length ? "needs_contract_review" : "needs_evidence";
    notices.push({
      id: `change:${candidate.id}`,
      kind,
      title: `${kindLabel(kind)}: ${candidate.title}`,
      trigger: candidate.rationale,
      recipient: "Заказчик / технический заказчик — уточнить по договору",
      readiness,
      priority: candidate.tone === "bad" ? "urgent" : "high",
      estimatedAmount: candidate.estimatedAmount,
      estimatedDelayDays: candidate.estimatedDelayDays,
      evidence: baseEvidence,
      targetTab: candidate.targetTab === "Материалы" ? "Бюджет / ВОР" : candidate.targetTab === "Риски" ? "Риски" : candidate.targetTab === "График" ? "График" : "Договор / Тендер",
      draftText: `По проекту «${project.name ?? "[наименование проекта]"}» выявлено основание: ${candidate.title}. Просим подтвердить порядок рассмотрения изменения и согласовать дальнейшие действия. Основание и ссылки на документы необходимо уточнить до отправки.`
    });
  }

  for (const item of scheduleItems.filter((schedule) => schedule.status === "delayed" || schedule.status === "stopped")) {
    const alreadyIncluded = notices.some((notice) => notice.title.includes(item.name) && notice.kind === "delay_notice");
    if (alreadyIncluded) continue;
    notices.push({
      id: `delay:${item.id}`,
      kind: "delay_notice",
      title: `${kindLabel("delay_notice")}: ${item.name}`,
      trigger: item.status === "stopped" ? "Работа отмечена как остановленная в графике." : "Работа отмечена как просроченная в графике.",
      recipient: "Заказчик / технический заказчик — уточнить по договору",
      readiness: evidenceLabels.length ? "needs_contract_review" : "needs_evidence",
      priority: item.status === "stopped" ? "urgent" : "high",
      estimatedAmount: 0,
      estimatedDelayDays: 0,
      evidence: baseEvidence,
      targetTab: "График",
      draftText: `По проекту «${project.name ?? "[наименование проекта]"}» требуется зафиксировать влияние события на срок работы «${item.name}». Договорный срок уведомления и получателя необходимо проверить до направления документа.`
    });
  }

  for (const risk of risks.filter((item) => item.status !== "closed" && customerChangePattern.test(`${item.title} ${item.reason}`))) {
    if (notices.some((notice) => notice.title.includes(risk.title))) continue;
    notices.push({
      id: `risk:${risk.id}`,
      kind: "claim_candidate",
      title: `${kindLabel("claim_candidate")}: ${risk.title}`,
      trigger: risk.reason || "Риск требует договорной оценки.",
      recipient: "Заказчик / ответственная сторона — уточнить по договору",
      readiness: evidenceLabels.length ? "needs_contract_review" : "needs_evidence",
      priority: risk.priority === "critical" ? "urgent" : "high",
      estimatedAmount: 0,
      estimatedDelayDays: 0,
      evidence: baseEvidence,
      targetTab: "Риски",
      draftText: `По проекту «${project.name ?? "[наименование проекта]"}» зафиксирован риск: ${risk.title}. Необходимо проверить договорное основание, доказательства и порядок уведомления до подготовки претензии.`
    });
  }

  const sorted = notices
    .sort((left, right) => (right.priority === "urgent" ? 3 : right.priority === "high" ? 2 : 1) - (left.priority === "urgent" ? 3 : left.priority === "high" ? 2 : 1) || right.estimatedAmount - left.estimatedAmount)
    .slice(0, 12);
  const noData = !project.contractAmount && !input.budgetItems?.length && !scheduleItems.length && !risks.length;
  const urgentCount = sorted.filter((notice) => notice.priority === "urgent").length;
  const estimatedAmount = sorted.reduce((sum, notice) => sum + notice.estimatedAmount, 0);
  const scheduleImpactDays = sorted.reduce((sum, notice) => sum + notice.estimatedDelayDays, 0);
  const status: ClaimsNoticesStatus = noData ? "no_data" : sorted.length ? "needs_review" : "controlled";
  const tone: ClaimsNoticesTone = noData ? "info" : urgentCount ? "bad" : sorted.length ? "warn" : "good";
  const headline = noData
    ? "Для контроля уведомлений нужны ВОР, график или риск-сигналы"
    : sorted.length
      ? `${sorted.length} оснований для уведомления или претензионного review`
      : "Явных оснований для уведомлений в текущем срезе нет";
  const nextStep = noData
    ? "Загрузить ВОР и график, затем фиксировать изменения и доказательства в документах проекта."
    : sorted.length
      ? "Проверить договорный срок, адресата и доказательства, затем утвердить текст уведомления отдельным действием."
      : "На планерке подтвердить, что новые события фиксируются до наступления договорных сроков.";

  return {
    summary: { status, tone, headline, nextStep, noticeCount: sorted.length, urgentCount, estimatedAmount, scheduleImpactDays, evidenceDocuments: evidenceLabels.length, contractReviewRequired: sorted.some((notice) => notice.readiness === "needs_contract_review") },
    notices: sorted,
    actions: [
      { title: "Проверить сроки и адресата", detail: `${sorted.length} оснований нельзя направлять без сверки договорного порядка уведомлений.`, ownerRole: "Юрист", priority: urgentCount ? "high" : "medium", targetTab: "Договор / Тендер" },
      { title: "Собрать доказательства", detail: evidenceLabels.length ? `Доступно ${evidenceLabels.length} документов/чеклист-позиций; подтвердите их относимость.` : "Нужны рапорты, переписка, акты или согласованные исходные данные.", ownerRole: "ПТО", priority: evidenceLabels.length ? "medium" : "high", targetTab: "Документы" },
      { title: "Оценить денежное влияние", detail: estimatedAmount ? `Предварительно ${money(estimatedAmount)}; это не сумма претензии или допсоглашения.` : "Ценовое влияние требуется рассчитать по ВОР и подтвержденным объемам.", ownerRole: "Сметчик", priority: estimatedAmount ? "high" : "medium", targetTab: "Бюджет / ВОР" },
      { title: "Зафиксировать сроковое влияние", detail: scheduleItems.some((item) => item.status === "delayed" || item.status === "stopped") ? "Сверить график, причину отклонения и факт уведомления." : "Сроковые основания в текущем графике не выявлены.", ownerRole: "РП", priority: sorted.length ? "medium" : "low", targetTab: "График" }
    ],
    limitations: [
      "v1 не отправляет уведомления и не создает претензии, письма, допсоглашения или юридические обязательства.",
      "Сроки уведомления, адресат и правовая квалификация определяются только после проверки договора и юристом.",
      "Черновик текста является управленческой заготовкой: перед отправкой нужны подтвержденные доказательства и отдельное согласование."
    ]
  };
}
