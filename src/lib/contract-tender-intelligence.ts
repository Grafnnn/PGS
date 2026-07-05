import { budgetTotals, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type ContractTenderTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ContractTenderReadiness = "no_data" | "missing_source" | "risky" | "ready_for_review" | "ready";
export type ContractTenderSeverity = "low" | "medium" | "high" | "critical";
export type ContractTenderRiskCategory = "payment" | "cashflow" | "scope" | "acceptance" | "penalty" | "documents" | "schedule" | "price" | "data_quality";
export type ContractTenderDocumentStatus = "present" | "missing" | "needs_review";
export type ContractTenderDecision = "insufficient_data" | "do_not_sign_yet" | "sign_after_changes" | "ready_for_management_review";

export type ContractTenderTerm = {
  key: string;
  label: string;
  value: string;
  tone: ContractTenderTone;
  evidence: string[];
};

export type ContractTenderRequiredDocument = {
  key: string;
  title: string;
  status: ContractTenderDocumentStatus;
  priority: "critical" | "high" | "medium";
  evidence: string[];
  suggestedAction: string;
};

export type ContractTenderRisk = {
  id: string;
  title: string;
  description: string;
  severity: ContractTenderSeverity;
  category: ContractTenderRiskCategory;
  evidence: string[];
  suggestedAction: string;
  decisionRequired: boolean;
};

export type ContractTenderAction = {
  id: string;
  title: string;
  detail: string;
  ownerRole: "executive" | "project_manager" | "finance" | "pto" | "estimator" | "legal" | "procurement";
  priority: "low" | "medium" | "high" | "urgent";
};

export type ContractTenderSummary = {
  readiness: ContractTenderReadiness;
  tone: ContractTenderTone;
  score: number;
  decision: ContractTenderDecision;
  headline: string;
  recommendation: string;
  contractValue: number;
  contractValueLabel: string;
  plannedCost: number;
  forecastProfit: number;
  forecastMarginPercent: number;
  missingCriticalDocs: number;
  highRisks: number;
  criticalRisks: number;
  dataLimitations: string[];
};

export type ContractTenderIntelligenceInput = {
  project?: Partial<Project> | null;
  contractText?: string | null;
  tenderText?: string | null;
  commercialOfferText?: string | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  documentChecklist?: DocumentChecklistItem[] | null;
};

export type ContractTenderIntelligenceModel = {
  summary: ContractTenderSummary;
  terms: ContractTenderTerm[];
  requiredDocuments: ContractTenderRequiredDocument[];
  risks: ContractTenderRisk[];
  actions: ContractTenderAction[];
  tenderReadiness: {
    label: string;
    blockers: string[];
    strengths: string[];
  };
  managementMemo: {
    title: string;
    sections: Array<{ title: string; text: string }>;
    copyText: string;
  };
};

const documentRequirements: Array<Omit<ContractTenderRequiredDocument, "status" | "evidence" | "suggestedAction"> & { aliases: string[] }> = [
  { key: "contract", title: "Договор / проект договора", priority: "critical", aliases: ["договор", "contract"] },
  { key: "technical-task", title: "ТЗ / проектная документация", priority: "critical", aliases: ["тз", "техническ", "проектн"] },
  { key: "estimate", title: "ВОР / смета / объемы", priority: "critical", aliases: ["вор", "смет", "объем", "объём"] },
  { key: "commercial-offer", title: "КП / расчет цены", priority: "high", aliases: ["кп", "коммерческ", "offer"] },
  { key: "schedule", title: "Календарный график", priority: "high", aliases: ["график", "срок", "schedule"] },
  { key: "payment-schedule", title: "График оплат / аванс", priority: "critical", aliases: ["оплат", "аванс", "payment"] },
  { key: "acceptance-forms", title: "Порядок приемки / КС", priority: "high", aliases: ["приемк", "приёмк", "кс-2", "кс-3", "акт"] },
  { key: "executive-docs", title: "Требования к исполнительной документации", priority: "medium", aliases: ["исполнительн", "сертификат", "паспорт"] },
  { key: "guarantee", title: "Гарантии / удержания / обеспечение", priority: "high", aliases: ["гарант", "удержан", "обеспеч"] },
  { key: "signatory", title: "Реквизиты и полномочия подписанта", priority: "medium", aliases: ["реквизит", "доверен", "подписант"] }
];

function normalize(value: string | undefined | null) {
  return (value ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function compactMoney(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  if (abs >= 1_000_000_000) return `${(safe / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (abs >= 1_000_000) return `${(safe / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(safe).toLocaleString("ru-RU")} ₽`;
}

function hasAny(text: string, patterns: Array<string | RegExp>) {
  return patterns.some((pattern) => typeof pattern === "string" ? text.includes(pattern) : pattern.test(text));
}

function evidence(text: string, positive: boolean, presentText: string, missingText: string) {
  if (positive) return [presentText];
  if (text) return [missingText];
  return ["Исходный текст договора/тендера не передан; анализ ограничен метаданными проекта."];
}

function documentEvidence(requirement: typeof documentRequirements[number], documents: ProjectDocument[], checklist: DocumentChecklistItem[]) {
  const aliases = requirement.aliases.map(normalize);
  const matchedDocuments = documents.filter((document) => {
    const source = normalize(`${document.title} ${document.category} ${document.fileName ?? ""} ${document.comment ?? ""}`);
    return aliases.some((alias) => source.includes(alias));
  });
  const matchedChecklist = checklist.filter((item) => {
    const source = normalize(`${item.key} ${item.title} ${item.categoryHints.join(" ")} ${item.evidence.join(" ")}`);
    return aliases.some((alias) => source.includes(alias));
  });
  return { matchedDocuments, matchedChecklist };
}

function buildRequiredDocuments(input: ContractTenderIntelligenceInput): ContractTenderRequiredDocument[] {
  const documents = input.documents ?? [];
  const checklist = input.documentChecklist ?? [];
  return documentRequirements.map((requirement) => {
    const { matchedDocuments, matchedChecklist } = documentEvidence(requirement, documents, checklist);
    const presentChecklist = matchedChecklist.filter((item) => item.status === "present");
    const needsReviewChecklist = matchedChecklist.filter((item) => item.status !== "present");
    const evidenceItems = [
      ...matchedDocuments.map((document) => `Документ: ${document.title}`),
      ...matchedChecklist.map((item) => `Checklist: ${item.title} (${item.status})`)
    ].slice(0, 4);
    const status: ContractTenderDocumentStatus = matchedDocuments.length || presentChecklist.length ? "present" : needsReviewChecklist.length ? "needs_review" : "missing";
    return {
      key: requirement.key,
      title: requirement.title,
      priority: requirement.priority,
      status,
      evidence: evidenceItems.length ? evidenceItems : ["Не найдено в метаданных документов и чеклисте."],
      suggestedAction:
        status === "present"
          ? "Проверить актуальность версии перед подписанием."
          : requirement.priority === "critical"
            ? "Запросить до управленческого решения по подписанию."
            : "Добавить в пакет проверки договора."
    };
  });
}

function buildTerms(text: string, project: Partial<Project>, payments: Payment[]): ContractTenderTerm[] {
  const advance = hasAny(text, [/аванс|предоплат/]);
  const paymentTerms = hasAny(text, [/оплат|платеж|платёж|расчет|расчёт/]) || payments.some((payment) => payment.direction === "incoming");
  const ksPayment = hasAny(text, [/кс-?\s*2|кс-?\s*3|акт выполненн|закрыти/]);
  const retention = hasAny(text, [/удержан|гарантийн.*удерж|retention/]);
  const penalties = hasAny(text, [/пен[яи]|штраф|неустойк/]);
  const penaltyCap = hasAny(text, [/не более|огранич|лимит|предельн|% от цены|% от сумм/]);
  const changeOrder = hasAny(text, [/доп.*соглаш|изменени.*объем|изменени.*обьем|корректиров|change order|дополнительн.*работ/]);
  const acceptance = hasAny(text, [/приемк|приемоч|приёмк|акт|кс-?\s*2|кс-?\s*3/]);
  const rejection = hasAny(text, [/мотивированн.*отказ|обоснованн.*отказ|замечан/]);
  const schedule = hasAny(text, [/срок|календарн|график|этап/]) || Boolean(project.startsAt || project.endsAt);
  const vat = hasAny(text, [/ндс|без ндс/]) || Boolean(project.vatMode);

  return [
    { key: "price", label: "Цена договора", value: project.contractAmount ? compactMoney(project.contractAmount) : "не указана", tone: project.contractAmount ? "info" : "warn", evidence: project.contractAmount ? ["Сумма взята из карточки проекта."] : ["В карточке проекта нет договорной суммы."] },
    { key: "advance", label: "Аванс", value: advance ? "упоминается" : "не найден", tone: advance ? "good" : "warn", evidence: evidence(text, advance, "В тексте найдено авансирование/предоплата.", "В тексте не найден аванс или предоплата.") },
    { key: "payment", label: "Порядок оплаты", value: paymentTerms ? (ksPayment ? "есть, связан с КС/актами" : "есть, требует сверки") : "не найден", tone: paymentTerms ? "info" : "bad", evidence: evidence(text, paymentTerms, "Найдены формулировки об оплате/расчетах.", "Не найден явный порядок оплаты.") },
    { key: "retention", label: "Удержания / гарантия", value: retention ? "есть" : "не найдены", tone: retention ? "warn" : "info", evidence: evidence(text, retention, "Найдены удержания/гарантии/обеспечение.", "Удержания или обеспечение не найдены.") },
    { key: "penalties", label: "Штрафы и пени", value: penalties ? (penaltyCap ? "есть с ограничением" : "есть, лимит не найден") : "не найдены", tone: penalties && !penaltyCap ? "bad" : penalties ? "warn" : "info", evidence: evidence(text, penalties, penaltyCap ? "Найдены штрафы/пени и признаки ограничения." : "Найдены штрафы/пени без явного лимита.", "Штрафы/пени не найдены в переданном тексте.") },
    { key: "scope-change", label: "Изменение объемов", value: changeOrder ? "механизм найден" : "не найден", tone: changeOrder ? "good" : "bad", evidence: evidence(text, changeOrder, "Есть признаки допсоглашений или корректировки объемов.", "Не найден механизм изменения объемов/допработ.") },
    { key: "acceptance", label: "Приемка и закрытие", value: acceptance ? (rejection ? "есть с процедурой замечаний" : "есть, отказ не найден") : "не найдена", tone: acceptance && rejection ? "good" : acceptance ? "warn" : "bad", evidence: evidence(text, acceptance, rejection ? "Есть приемка и мотивированный отказ/замечания." : "Есть приемка, но процедура отказа/замечаний неочевидна.", "Не найден порядок приемки.") },
    { key: "schedule", label: "Сроки / этапы", value: schedule ? "есть" : "не найдены", tone: schedule ? "info" : "warn", evidence: evidence(text, schedule, "Найдены сроки, этапы или график.", "Сроки и график не найдены.") },
    { key: "vat", label: "НДС", value: vat ? (project.vatMode === "no_vat" ? "без НДС" : project.vatMode === "vat" ? "с НДС" : "упоминается") : "не найден", tone: vat ? "info" : "warn", evidence: evidence(text, vat, "НДС найден в тексте или карточке проекта.", "НДС не найден в переданном тексте.") }
  ];
}

function risk(
  id: string,
  title: string,
  description: string,
  severity: ContractTenderSeverity,
  category: ContractTenderRiskCategory,
  suggestedAction: string,
  evidenceItems: string[],
  decisionRequired = severity === "high" || severity === "critical"
): ContractTenderRisk {
  return { id, title, description, severity, category, suggestedAction, evidence: evidenceItems, decisionRequired };
}

function termValue(terms: ContractTenderTerm[], key: string) {
  return terms.find((term) => term.key === key);
}

function buildRisks(text: string, terms: ContractTenderTerm[], documents: ContractTenderRequiredDocument[], input: ContractTenderIntelligenceInput): ContractTenderRisk[] {
  const risks: ContractTenderRisk[] = [];
  const hasSourceText = Boolean(text);
  const criticalMissingDocs = documents.filter((document) => document.priority === "critical" && document.status !== "present");
  const highMissingDocs = documents.filter((document) => document.priority === "high" && document.status === "missing");
  const existingRisks = input.risks ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const budgetItems = input.budgetItems ?? [];
  const materials = input.materials ?? [];
  const payments = input.payments ?? [];
  const budget = budgetTotals(input.project?.contractAmount ?? 0, budgetItems);
  const finance = financeTotals(payments);
  const materialStats = materialTotals(materials);
  const hasBusinessData = Boolean(text || (input.documents ?? []).length || (input.documentChecklist ?? []).length || budgetItems.length || scheduleItems.length || payments.length || input.project?.contractAmount);

  if (!hasBusinessData) return [];

  if (!hasSourceText) {
    risks.push(risk("contract:missing-source", "Нет текста договора/тендера", "Нельзя делать вывод о подписании только по карточке проекта и метаданным.", "critical", "data_quality", "Загрузить договор, ТЗ или КП и повторить анализ.", ["contractText/tenderText/commercialOfferText не переданы."]));
  }
  if (termValue(terms, "payment")?.tone === "bad") {
    risks.push(risk("contract:payment-terms", "Не найден порядок оплаты", "Без условий оплаты невозможно надежно оценить cashflow, авансирование и дебиторку.", "high", "payment", "Запросить раздел оплаты: аванс, этапы, сроки оплаты, документы для оплаты.", termValue(terms, "payment")?.evidence ?? []));
  }
  if (termValue(terms, "advance")?.tone === "warn" && (finance.financingNeed > 0 || budget.totalPlannedCost > 0)) {
    risks.push(risk("contract:no-advance", "Аванс не найден при наличии плановой себестоимости", "Проект может потребовать собственного финансирования до закрытия КС/актов.", "high", "cashflow", "Согласовать аванс или календарь оплат под закупки и ФОТ.", termValue(terms, "advance")?.evidence ?? []));
  }
  if (termValue(terms, "penalties")?.tone === "bad") {
    risks.push(risk("contract:uncapped-penalty", "Штрафы без явного лимита", "Найдены штрафные санкции, но ограничение ответственности не определено в переданном тексте.", "high", "penalty", "Добавить лимит неустойки и исключения по зависимым причинам.", termValue(terms, "penalties")?.evidence ?? []));
  }
  if (termValue(terms, "scope-change")?.tone === "bad") {
    risks.push(risk("contract:no-change-order", "Нет механизма изменения объемов", "Допработы и изменение ВОР могут остаться неоплаченными.", "high", "scope", "Добавить порядок допсоглашений, фиксации объемов и изменения цены.", termValue(terms, "scope-change")?.evidence ?? []));
  }
  if (termValue(terms, "acceptance")?.tone === "bad") {
    risks.push(risk("contract:no-acceptance", "Не найден порядок приемки", "Без приемки и КС/актов неясно, как закрывать объемы и получать оплату.", "high", "acceptance", "Согласовать приемку, сроки проверки, мотивированный отказ и пакет КС.", termValue(terms, "acceptance")?.evidence ?? []));
  } else if (termValue(terms, "acceptance")?.tone === "warn") {
    risks.push(risk("contract:weak-acceptance", "Приемка требует уточнения", "Есть приемка, но процедура отказа/замечаний не выглядит полной.", "medium", "acceptance", "Уточнить сроки проверки и порядок замечаний заказчика.", termValue(terms, "acceptance")?.evidence ?? [], false));
  }
  if (criticalMissingDocs.length) {
    risks.push(risk("contract:missing-critical-docs", "Нет критичных приложений к договору", `Не закрыты: ${criticalMissingDocs.map((document) => document.title).join(", ")}.`, "critical", "documents", "Собрать критичные приложения до подписания/участия.", criticalMissingDocs.flatMap((document) => document.evidence).slice(0, 5)));
  } else if (highMissingDocs.length) {
    risks.push(risk("contract:missing-high-docs", "Есть недостающие документы высокого приоритета", highMissingDocs.map((document) => document.title).join(", "), "medium", "documents", "Добавить документы в пакет проверки.", highMissingDocs.flatMap((document) => document.evidence).slice(0, 5), false));
  }
  if ((input.project?.contractAmount ?? 0) > 0 && budget.totalPlannedCost > 0 && budget.forecastProfit < 0) {
    risks.push(risk("contract:negative-margin", "Отрицательная прогнозная маржа", `Прогноз прибыли ${compactMoney(budget.forecastProfit)}.`, "critical", "price", "Пересчитать КП/цену договора или исключить убыточные условия.", [`Себестоимость: ${compactMoney(budget.totalForecastCost)}.`]));
  }
  if (scheduleItems.length === 0 && hasSourceText && !hasAny(text, [/срок|график|этап/])) {
    risks.push(risk("contract:no-schedule", "Нет графика и сроков исполнения", "Сроковые обязательства не связаны с календарным планом проекта.", "medium", "schedule", "Сформировать график работ и привязать его к договорным этапам.", ["График пустой, сроки в тексте не найдены."], false));
  }
  if (materialStats.deficitItems.length && !hasAny(text, [/поставк|материал|давальческ|снабжен/])) {
    risks.push(risk("contract:material-responsibility", "Неясна ответственность за материалы", "Есть дефицит материалов, но договорный контур поставки/снабжения не найден.", "medium", "scope", "Уточнить, кто отвечает за материалы, сроки поставки и замену номенклатуры.", [materialStats.deficitItems[0]?.name ?? "Есть дефицит материалов."], false));
  }
  for (const existing of existingRisks.filter((item) => item.priority === "critical" || item.priority === "high").slice(0, 3)) {
    risks.push(risk(`contract:manual:${existing.id}`, `Учесть риск проекта: ${existing.title}`, existing.reason, existing.priority, "data_quality", "Проверить, отражен ли риск в договоре/КП/ТЗ.", [existing.owner, existing.dueAt].filter(Boolean), existing.priority === "critical"));
  }

  return risks.sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || left.title.localeCompare(right.title, "ru"));
}

function severityRank(severity: ContractTenderSeverity) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity];
}

function toneFromReadiness(readiness: ContractTenderReadiness): ContractTenderTone {
  if (readiness === "ready") return "good";
  if (readiness === "ready_for_review") return "info";
  if (readiness === "risky" || readiness === "missing_source") return "bad";
  return "neutral";
}

function decisionFromRisks(readiness: ContractTenderReadiness, risks: ContractTenderRisk[]): ContractTenderDecision {
  if (readiness === "no_data" || readiness === "missing_source") return "insufficient_data";
  if (risks.some((riskItem) => riskItem.severity === "critical")) return "do_not_sign_yet";
  if (risks.some((riskItem) => riskItem.severity === "high")) return "sign_after_changes";
  return "ready_for_management_review";
}

function buildReadiness(
  hasAnyData: boolean,
  hasSourceText: boolean,
  documents: ContractTenderRequiredDocument[],
  risks: ContractTenderRisk[]
): ContractTenderReadiness {
  if (!hasAnyData) return "no_data";
  if (!hasSourceText) return "missing_source";
  if (documents.some((document) => document.priority === "critical" && document.status !== "present")) return "risky";
  if (risks.some((riskItem) => riskItem.severity === "critical" || riskItem.severity === "high")) return "risky";
  if (risks.length || documents.some((document) => document.status !== "present")) return "ready_for_review";
  return "ready";
}

function buildActions(summary: ContractTenderSummary, documents: ContractTenderRequiredDocument[], risks: ContractTenderRisk[]): ContractTenderAction[] {
  const actions: ContractTenderAction[] = [];
  if (summary.readiness === "no_data" || summary.readiness === "missing_source") {
    actions.push({ id: "contract:action:source", title: "Загрузить договор / ТЗ / КП", detail: "Без исходного текста нельзя подтвердить условия оплаты, приемки и ответственности.", ownerRole: "project_manager", priority: "urgent" });
  }
  for (const document of documents.filter((item) => item.status !== "present").slice(0, 4)) {
    actions.push({ id: `contract:action:doc:${document.key}`, title: `Запросить: ${document.title}`, detail: document.suggestedAction, ownerRole: document.key === "payment-schedule" ? "finance" : "pto", priority: document.priority === "critical" ? "high" : "medium" });
  }
  for (const riskItem of risks.filter((item) => item.decisionRequired).slice(0, 5)) {
    actions.push({ id: `contract:action:risk:${riskItem.id}`, title: riskItem.suggestedAction, detail: riskItem.description, ownerRole: riskItem.category === "payment" || riskItem.category === "cashflow" ? "finance" : riskItem.category === "scope" || riskItem.category === "acceptance" ? "project_manager" : "executive", priority: riskItem.severity === "critical" ? "urgent" : "high" });
  }
  if (!actions.length) {
    actions.push({ id: "contract:action:review", title: "Передать пакет на управленческий review", detail: "Критичных блокеров по доступным данным не найдено, но требуется юридическая и коммерческая проверка.", ownerRole: "executive", priority: "medium" });
  }
  return actions.slice(0, 10);
}

function decisionLabel(decision: ContractTenderDecision) {
  if (decision === "insufficient_data") return "Недостаточно данных для решения";
  if (decision === "do_not_sign_yet") return "Не подписывать до исправлений";
  if (decision === "sign_after_changes") return "Подписывать только после изменений";
  return "Можно выносить на управленческий review";
}

function buildMemo(summary: ContractTenderSummary, terms: ContractTenderTerm[], risks: ContractTenderRisk[], actions: ContractTenderAction[]) {
  const topRisks = risks.slice(0, 4).map((riskItem) => `${riskItem.severity}: ${riskItem.title}`).join("; ") || "Критичных рисков по доступным данным не найдено.";
  const payment = termValue(terms, "payment")?.value ?? "нет данных";
  const acceptance = termValue(terms, "acceptance")?.value ?? "нет данных";
  const sections = [
    { title: "Вывод", text: `${decisionLabel(summary.decision)}. ${summary.recommendation}` },
    { title: "Цена и маржа", text: `Сумма: ${summary.contractValueLabel}. Прогноз прибыли: ${compactMoney(summary.forecastProfit)} (${summary.forecastMarginPercent.toFixed(1)}%).` },
    { title: "Оплата и приемка", text: `Оплата: ${payment}. Приемка: ${acceptance}.` },
    { title: "Риски", text: topRisks },
    { title: "Следующие действия", text: actions.slice(0, 4).map((action) => action.title).join("; ") || "Повторить проверку после обновления данных." }
  ];
  return {
    title: "Управленческая записка по договору / тендеру",
    sections,
    copyText: sections.map((section) => `${section.title}\n${section.text}`).join("\n\n")
  };
}

export function buildContractTenderIntelligence(input: ContractTenderIntelligenceInput): ContractTenderIntelligenceModel {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const payments = input.payments ?? [];
  const documents = input.documents ?? [];
  const documentChecklist = input.documentChecklist ?? [];
  const text = normalize([input.contractText, input.tenderText, input.commercialOfferText].filter(Boolean).join("\n"));
  const hasSourceText = Boolean(text);
  const hasAnyData = Boolean(hasSourceText || documents.length || documentChecklist.length || budgetItems.length || scheduleItems.length || payments.length || project.contractAmount);
  const budget = budgetTotals(project.contractAmount ?? 0, budgetItems);
  const works = workTotals(scheduleItems);
  const terms = buildTerms(text, project, payments);
  const requiredDocuments = buildRequiredDocuments(input);
  const risks = buildRisks(text, terms, requiredDocuments, input);
  const readiness = buildReadiness(hasAnyData, hasSourceText, requiredDocuments, risks);
  const criticalRisks = risks.filter((riskItem) => riskItem.severity === "critical").length;
  const highRisks = risks.filter((riskItem) => riskItem.severity === "high").length;
  const missingCriticalDocs = requiredDocuments.filter((document) => document.priority === "critical" && document.status !== "present").length;
  const presentDocs = requiredDocuments.filter((document) => document.status === "present").length;
  const docScore = requiredDocuments.length ? (presentDocs / requiredDocuments.length) * 100 : 0;
  const riskPenalty = criticalRisks * 22 + highRisks * 12 + risks.filter((item) => item.severity === "medium").length * 5;
  const sourcePenalty = hasSourceText ? 0 : 35;
  const scheduleSignal = scheduleItems.length ? Math.min(10, works.completionPercent / 10) : 0;
  const score = Math.max(0, Math.min(100, Math.round(docScore * 0.45 + (hasSourceText ? 35 : 0) + scheduleSignal + (budgetItems.length ? 10 : 0) - riskPenalty - sourcePenalty)));
  const tone = toneFromReadiness(readiness);
  const decision = decisionFromRisks(readiness, risks);
  const actions = buildActions(
    {
      readiness,
      tone,
      score,
      decision,
      headline: "",
      recommendation: "",
      contractValue: project.contractAmount ?? 0,
      contractValueLabel: compactMoney(project.contractAmount ?? 0),
      plannedCost: budget.totalPlannedCost,
      forecastProfit: budget.forecastProfit,
      forecastMarginPercent: budget.forecastMarginPercent,
      missingCriticalDocs,
      highRisks,
      criticalRisks,
      dataLimitations: []
    },
    requiredDocuments,
    risks
  );
  const dataLimitations = [
    !hasSourceText ? "Не передан текст договора/ТЗ/КП; используются только метаданные." : null,
    !documents.length && !documentChecklist.length ? "Нет документального чеклиста или документов." : null,
    !budgetItems.length ? "Нет ВОР/бюджетных строк для проверки маржи и объема." : null,
    !scheduleItems.length ? "Нет графика для проверки сроков." : null
  ].filter(Boolean) as string[];
  const recommendation =
    decision === "insufficient_data"
      ? "Сначала собрать исходный договорный пакет и повторить анализ."
      : decision === "do_not_sign_yet"
        ? "Зафиксировать критичные правки до подписания или подачи финального КП."
        : decision === "sign_after_changes"
          ? "Согласовать изменения по оплате, приемке, объемам или документам до управленческого GO."
          : "Передать пакет руководителю с отмеченными ограничениями и версионностью документов.";
  const summary: ContractTenderSummary = {
    readiness,
    tone,
    score,
    decision,
    headline: decisionLabel(decision),
    recommendation,
    contractValue: project.contractAmount ?? 0,
    contractValueLabel: compactMoney(project.contractAmount ?? 0),
    plannedCost: budget.totalPlannedCost,
    forecastProfit: budget.forecastProfit,
    forecastMarginPercent: budget.forecastMarginPercent,
    missingCriticalDocs,
    highRisks,
    criticalRisks,
    dataLimitations
  };

  return {
    summary,
    terms,
    requiredDocuments,
    risks,
    actions,
    tenderReadiness: {
      label: readiness === "ready" ? "готово к управленческому review" : readiness === "ready_for_review" ? "можно смотреть с оговорками" : readiness === "risky" ? "требуются правки" : readiness === "missing_source" ? "нужен исходный текст" : "нет данных",
      blockers: [...risks.filter((riskItem) => riskItem.severity === "critical" || riskItem.severity === "high").map((riskItem) => riskItem.title), ...requiredDocuments.filter((document) => document.priority === "critical" && document.status !== "present").map((document) => `Нет: ${document.title}`)].slice(0, 8),
      strengths: [
        termValue(terms, "payment")?.tone !== "bad" ? "Есть платежный контур" : null,
        termValue(terms, "acceptance")?.tone !== "bad" ? "Есть приемочный контур" : null,
        budgetItems.length ? "Есть ВОР/бюджетная база" : null,
        scheduleItems.length ? "Есть график работ" : null,
        procurementRequests.length || materials.length ? "Есть снабженческий контур" : null
      ].filter(Boolean) as string[]
    },
    managementMemo: buildMemo(summary, terms, risks, actions)
  };
}
