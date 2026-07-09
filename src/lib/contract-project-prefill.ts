import type { ProjectCreationDraft, ProjectObjectType, ProjectTenderSource, ProjectVatMode, ProjectVolumeChangeMode } from "./project-onboarding-intelligence";

export type ContractPrefillConfidence = "low" | "medium" | "high";

export type ContractPrefillField =
  | "projectName"
  | "customerName"
  | "contractorName"
  | "objectAddress"
  | "objectType"
  | "scopeSummary"
  | "contractAmount"
  | "vatMode"
  | "vatPercent"
  | "startDate"
  | "finishDate"
  | "duration"
  | "paymentTerms"
  | "advanceTerms"
  | "contractSource"
  | "volumeChangeMode"
  | "acceptanceTerms"
  | "penalties"
  | "retention";

export type ContractProjectPrefill = {
  projectName?: string;
  customerName?: string;
  contractorName?: string;
  objectAddress?: string;
  objectType?: ProjectObjectType;
  scopeSummary?: string;
  contractAmount?: number;
  vatMode?: ProjectVatMode;
  vatPercent?: number;
  startDate?: string;
  finishDate?: string;
  duration?: string;
  paymentTerms?: string;
  advanceTerms?: string;
  contractSource?: ProjectTenderSource;
  volumeChangeMode?: ProjectVolumeChangeMode;
  acceptanceTerms?: string;
  penalties?: string;
  retention?: string;
  keyClauses: string[];
  warnings: string[];
  missingFields: string[];
  confidenceByField: Partial<Record<ContractPrefillField, ContractPrefillConfidence>>;
  evidenceByField: Partial<Record<ContractPrefillField, string>>;
};

export type ContractPrefillExtractionInput = {
  text: string;
  fileName?: string;
  existingDraft?: ProjectCreationDraft;
};

const fieldLabels: Record<ContractPrefillField, string> = {
  projectName: "название проекта",
  customerName: "заказчик",
  contractorName: "подрядчик",
  objectAddress: "адрес объекта",
  objectType: "тип объекта",
  scopeSummary: "описание/scope",
  contractAmount: "сумма договора",
  vatMode: "режим НДС",
  vatPercent: "ставка НДС",
  startDate: "дата начала",
  finishDate: "дата завершения",
  duration: "длительность",
  paymentTerms: "условия оплаты",
  advanceTerms: "аванс",
  contractSource: "источник договора",
  volumeChangeMode: "режим изменения объемов",
  acceptanceTerms: "условия КС/приемки",
  penalties: "штрафы/пени",
  retention: "удержания"
};

const requiredFields: ContractPrefillField[] = ["projectName", "customerName", "objectAddress", "contractAmount", "startDate", "finishDate", "paymentTerms"];

function clean(value: string | undefined | null) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .trim()
    .replace(/^[:\-–—,. ]+|[:\-–—,. ]+$/g, "");
}

function safeSnippet(value: string | undefined | null) {
  return clean(value).slice(0, 220);
}

function lines(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean);
}

function findLine(allLines: string[], patterns: RegExp[]) {
  return allLines.find((line) => patterns.some((pattern) => pattern.test(line)));
}

function afterLabel(line: string, labels: RegExp[]) {
  for (const label of labels) {
    const match = line.match(label);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function stripLegalSuffix(value: string) {
  return clean(value).replace(/[,.;]?\s*(именуем\w*|далее|в лице).*/i, "");
}

function parseRussianAmount(value: string) {
  const amountMatch = value.match(/(\d[\d\s]*(?:[,.]\d{1,2})?)\s*(?:руб|₽|р\b)/i) ?? value.match(/(\d[\d\s]{4,}(?:[,.]\d{1,2})?)/);
  if (!amountMatch?.[1]) return undefined;
  const parsed = Number(amountMatch[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDate(value: string) {
  const dot = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (dot) {
    const day = dot[1].padStart(2, "0");
    const month = dot[2].padStart(2, "0");
    return `${dot[3]}-${month}-${day}`;
  }
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return iso?.[0];
}

function setField<T extends ContractPrefillField>(
  result: ContractProjectPrefill,
  field: T,
  value: ContractProjectPrefill[T],
  confidence: ContractPrefillConfidence,
  evidence?: string
) {
  if (value === undefined || value === null || value === "") return;
  (result[field] as ContractProjectPrefill[T]) = value;
  result.confidenceByField[field] = confidence;
  if (evidence) result.evidenceByField[field] = safeSnippet(evidence);
}

export function inferVatMode(text: string): { vatMode?: ProjectVatMode; vatPercent?: number; evidence?: string } {
  const allLines = lines(text);
  const noVat = findLine(allLines, [/без\s+ндс/i, /ндс\s+не\s+облага/i]);
  if (noVat) return { vatMode: "no_vat", evidence: noVat };

  const vatLine = findLine(allLines, [/ндс/i]);
  if (!vatLine) return {};
  const percentMatch = vatLine.match(/ндс[^\d]{0,20}(\d{1,2})(?:[,.]\d+)?\s*%/i) ?? vatLine.match(/(\d{1,2})(?:[,.]\d+)?\s*%\s*ндс/i);
  const vatPercent = percentMatch?.[1] ? Number(percentMatch[1]) : undefined;
  const vatMode = /в\s+том\s+числе\s+ндс|с\s+ндс/i.test(vatLine) ? "including_vat" : "excluding_vat";
  return { vatMode, vatPercent: Number.isFinite(vatPercent) ? vatPercent : undefined, evidence: vatLine };
}

export function inferVolumeChangeMode(text: string): { volumeChangeMode?: ProjectVolumeChangeMode; evidence?: string } {
  const allLines = lines(text);
  const fact = findLine(allLines, [/фактически\s+выполненн/i, /по\s+фактическим\s+объем/i]);
  if (fact) return { volumeChangeMode: "fact_based", evidence: fact };
  const canChange = findLine(allLines, [/объем[ыа]?\s+могут\s+быть\s+измен/i, /изменени[ея]\s+объем/i]);
  if (canChange) return { volumeChangeMode: "can_change", evidence: canChange };
  const fixed = findLine(allLines, [/твердая\s+цена|фиксированн(?:ый|ая)\s+объем|объем\s+работ\s+не\s+подлежит\s+измен/i]);
  if (fixed) return { volumeChangeMode: "fixed_scope", evidence: fixed };
  return {};
}

export function inferAcceptanceTerms(text: string): { acceptanceTerms?: string; evidence?: string } {
  const allLines = lines(text);
  const line = findLine(allLines, [/кс-?2|кс-?3|акт[ыа]?\s+выполненн/i, /приемк[аи]\s+работ/i]);
  if (!line) return {};
  return { acceptanceTerms: line, evidence: line };
}

export function inferPaymentTerms(text: string): { paymentTerms?: string; advanceTerms?: string; retention?: string; evidence?: string } {
  const allLines = lines(text);
  const payment = findLine(allLines, [/оплат[аы]|расчет[ыов]/i]);
  const advance = findLine(allLines, [/аванс|предоплат/i]);
  const retention = findLine(allLines, [/удержан|гарантийн\w+\s+удерж/i]);
  return {
    paymentTerms: payment,
    advanceTerms: advance,
    retention,
    evidence: payment ?? advance ?? retention
  };
}

function inferObjectType(value: string): ProjectObjectType | undefined {
  const text = value.toLowerCase();
  if (/инженерн|сети|водопровод|канализац|теплосет|электросет/.test(text)) return "engineering";
  if (/жил|мкд|квартир/.test(text)) return "residential";
  if (/школ|сад|поликлиник|больниц|социальн/.test(text)) return "social";
  if (/реконструкц|капитальн\w*\s+ремонт|капремонт/.test(text)) return "reconstruction";
  if (/кровл|фасад/.test(text)) return "roofing_facade";
  if (/отделоч|внутренн/.test(text)) return "interior";
  if (/офис|торгов|склад|административн|коммерч/.test(text)) return "commercial";
  return undefined;
}

function buildScopeSummary(textLines: string[]) {
  const scopeLine = findLine(textLines, [/предмет\s+договора|выполнить\s+работ|объем\s+работ|состав\s+работ/i]);
  return scopeLine ? safeSnippet(scopeLine) : undefined;
}

export function buildPrefillWarnings(result: ContractProjectPrefill) {
  const warnings: string[] = [];
  for (const field of requiredFields) {
    if (result[field] === undefined || result[field] === "") warnings.push(`Не найдено поле: ${fieldLabels[field]}.`);
  }
  if (result.contractAmount !== undefined && result.contractAmount <= 0) warnings.push("Сумма договора выглядит нулевой или некорректной.");
  if (result.startDate && result.finishDate && new Date(result.finishDate).getTime() < new Date(result.startDate).getTime()) {
    warnings.push("Дата завершения раньше даты начала; оставьте даты на ручную проверку.");
    delete result.finishDate;
    delete result.confidenceByField.finishDate;
  }
  if (result.vatMode === "including_vat" && result.vatPercent === undefined) warnings.push("Найден НДС в сумме, но ставка НДС не определена.");
  if (result.penalties) warnings.push("В договоре найдены штрафы/пени; проверьте договорные риски перед подписанием.");
  if (result.retention) warnings.push("В договоре найдены удержания; проверьте влияние на cashflow.");
  return Array.from(new Set(warnings));
}

export function normalizeContractPrefill(result: ContractProjectPrefill): ContractProjectPrefill {
  const optional = (value: string | undefined) => {
    const cleaned = clean(value);
    return cleaned || undefined;
  };
  const normalized: ContractProjectPrefill = {
    ...result,
    projectName: optional(result.projectName),
    customerName: optional(result.customerName),
    contractorName: optional(result.contractorName),
    objectAddress: optional(result.objectAddress),
    scopeSummary: clean(result.scopeSummary),
    paymentTerms: optional(result.paymentTerms),
    advanceTerms: optional(result.advanceTerms),
    acceptanceTerms: optional(result.acceptanceTerms),
    penalties: optional(result.penalties),
    retention: optional(result.retention),
    keyClauses: Array.from(new Set(result.keyClauses.map(safeSnippet).filter(Boolean))).slice(0, 10),
    warnings: [],
    missingFields: []
  };
  normalized.warnings = buildPrefillWarnings(normalized);
  normalized.missingFields = requiredFields.filter((field) => normalized[field] === undefined || normalized[field] === "").map((field) => fieldLabels[field]);
  return normalized;
}

export function extractProjectPrefillFromContractText(input: ContractPrefillExtractionInput): ContractProjectPrefill {
  const text = clean(input.text);
  const textLines = lines(input.text);
  const result: ContractProjectPrefill = {
    keyClauses: [],
    warnings: [],
    missingFields: [],
    confidenceByField: {},
    evidenceByField: {}
  };

  if (!text) {
    result.warnings = ["Текст договора пустой или не извлечен."];
    result.missingFields = requiredFields.map((field) => fieldLabels[field]);
    return result;
  }

  const objectLine = findLine(textLines, [/объект\s*(?:строительства|работ)?\s*[:\-–—]/i, /наименование\s+объекта\s*[:\-–—]/i]);
  const objectValue = objectLine ? afterLabel(objectLine, [/объект\s*(?:строительства|работ)?\s*[:\-–—]\s*(.+)$/i, /наименование\s+объекта\s*[:\-–—]\s*(.+)$/i]) : "";
  if (objectValue) {
    setField(result, "projectName", objectValue, "high", objectLine);
    const inferredType = inferObjectType(objectValue);
    if (inferredType) setField(result, "objectType", inferredType, "medium", objectLine);
  }

  const customerLine = findLine(textLines, [/заказчик\s*[:\-–—]/i, /именуем\w*\s+.*заказчик/i]);
  const customerValue = customerLine ? afterLabel(customerLine, [/заказчик\s*[:\-–—]\s*(.+)$/i]) || stripLegalSuffix(customerLine.replace(/^.*?заказчик/i, "")) : "";
  setField(result, "customerName", stripLegalSuffix(customerValue), customerValue.includes("именуем") ? "medium" : "high", customerLine);

  const contractorLine = findLine(textLines, [/подрядчик\s*[:\-–—]/i, /исполнитель\s*[:\-–—]/i, /именуем\w*\s+.*(?:подрядчик|исполнитель)/i]);
  const contractorValue = contractorLine
    ? afterLabel(contractorLine, [/(?:подрядчик|исполнитель)\s*[:\-–—]\s*(.+)$/i]) || stripLegalSuffix(contractorLine.replace(/^.*?(?:подрядчик|исполнитель)/i, ""))
    : "";
  setField(result, "contractorName", stripLegalSuffix(contractorValue), "medium", contractorLine);

  const addressLine = findLine(textLines, [/адрес\s+объекта\s*[:\-–—]/i, /место\s+выполнения\s+работ\s*[:\-–—]/i, /расположенн\w+\s+по\s+адресу/i]);
  const addressValue = addressLine
    ? afterLabel(addressLine, [/адрес\s+объекта\s*[:\-–—]\s*(.+)$/i, /место\s+выполнения\s+работ\s*[:\-–—]\s*(.+)$/i, /по\s+адресу\s*[:\-–—]?\s*(.+)$/i])
    : "";
  setField(result, "objectAddress", addressValue, "high", addressLine);

  const amountLine = findLine(textLines, [/цен[аы]\s+договора/i, /стоимость\s+работ/i, /договорн\w+\s+цен/i]);
  const amount = amountLine ? parseRussianAmount(amountLine) : parseRussianAmount(text);
  setField(result, "contractAmount", amount, amountLine ? "high" : "low", amountLine ?? textLines.find((line) => parseRussianAmount(line)));

  const vat = inferVatMode(text);
  setField(result, "vatMode", vat.vatMode, vat.vatMode === "no_vat" ? "high" : "medium", vat.evidence);
  setField(result, "vatPercent", vat.vatPercent, "medium", vat.evidence);

  const periodLine = findLine(textLines, [/срок\s+выполнения\s+работ/i, /начало\s+работ/i, /окончани[ея]\s+работ/i]);
  if (periodLine) {
    const dates = Array.from(periodLine.matchAll(/\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b|\b20\d{2}-\d{2}-\d{2}\b/g)).map((match) => parseDate(match[0])).filter(Boolean);
    if (dates[0]) setField(result, "startDate", dates[0], /начало|с\s+\d/i.test(periodLine) ? "medium" : "low", periodLine);
    if (dates[1]) setField(result, "finishDate", dates[1], "medium", periodLine);
  }
  const startLine = findLine(textLines, [/начало\s+работ\s*[:\-–—]/i]);
  const finishLine = findLine(textLines, [/окончани[ея]\s+работ\s*[:\-–—]/i, /завершени[ея]\s+работ\s*[:\-–—]/i]);
  const startDate = startLine ? parseDate(startLine) : undefined;
  const finishDate = finishLine ? parseDate(finishLine) : undefined;
  setField(result, "startDate", startDate, "high", startLine);
  setField(result, "finishDate", finishDate, "high", finishLine);
  const durationLine = findLine(textLines, [/(\d+)\s*(?:календарн\w+|рабоч\w+)?\s*дн/i, /срок\s+.*\d+\s*месяц/i]);
  if (durationLine) setField(result, "duration", durationLine, "medium", durationLine);

  const payment = inferPaymentTerms(text);
  setField(result, "paymentTerms", payment.paymentTerms, "medium", payment.evidence);
  setField(result, "advanceTerms", payment.advanceTerms, "medium", payment.advanceTerms);
  setField(result, "retention", payment.retention, "medium", payment.retention);

  const volume = inferVolumeChangeMode(text);
  setField(result, "volumeChangeMode", volume.volumeChangeMode, "medium", volume.evidence);

  const acceptance = inferAcceptanceTerms(text);
  setField(result, "acceptanceTerms", acceptance.acceptanceTerms, "medium", acceptance.evidence);

  const penalties = findLine(textLines, [/пен[яи]|штраф/i]);
  setField(result, "penalties", penalties, "medium", penalties);

  setField(result, "contractSource", /тендер|закупк|конкурс/i.test(text) ? "tender" : "contract", "medium", input.fileName);
  const scope = buildScopeSummary(textLines) ?? objectValue;
  setField(result, "scopeSummary", scope, scope ? "medium" : "low", scope);

  result.keyClauses = [payment.paymentTerms, payment.advanceTerms, acceptance.acceptanceTerms, volume.evidence, penalties, payment.retention].filter((item): item is string => Boolean(item));
  return normalizeContractPrefill(result);
}

function hasManualValue(value: unknown) {
  return typeof value === "number" ? Number.isFinite(value) : clean(String(value ?? "")).length > 0;
}

export function mergePrefillIntoProjectDraft(
  draft: ProjectCreationDraft,
  prefill: ContractProjectPrefill,
  options: { overwrite?: boolean; fields?: ContractPrefillField[] } = {}
): ProjectCreationDraft {
  const overwrite = options.overwrite === true;
  const fields = new Set(options.fields ?? []);
  const shouldApply = (field: ContractPrefillField, current: unknown, next: unknown) => {
    if (next === undefined || next === "") return false;
    if (fields.size && !fields.has(field)) return false;
    return overwrite || !hasManualValue(current);
  };
  const next: ProjectCreationDraft = { ...draft };
  if (shouldApply("projectName", next.name, prefill.projectName)) next.name = prefill.projectName;
  if (shouldApply("customerName", next.customer, prefill.customerName)) next.customer = prefill.customerName;
  if (shouldApply("projectName", next.object, prefill.projectName)) next.object = prefill.projectName;
  if (shouldApply("objectAddress", next.address, prefill.objectAddress)) next.address = prefill.objectAddress;
  if (shouldApply("objectType", next.objectType, prefill.objectType)) next.objectType = prefill.objectType;
  if (shouldApply("scopeSummary", next.description, prefill.scopeSummary)) next.description = prefill.scopeSummary;
  if (shouldApply("contractAmount", next.contractAmount, prefill.contractAmount)) next.contractAmount = String(prefill.contractAmount);
  if (shouldApply("vatMode", next.vatMode, prefill.vatMode)) next.vatMode = prefill.vatMode;
  if (shouldApply("vatPercent", next.vatPercent, prefill.vatPercent)) next.vatPercent = String(prefill.vatPercent);
  if (shouldApply("startDate", next.startsAt, prefill.startDate)) next.startsAt = prefill.startDate;
  if (shouldApply("finishDate", next.endsAt, prefill.finishDate)) next.endsAt = prefill.finishDate;
  if (shouldApply("contractSource", next.tenderSource, prefill.contractSource)) next.tenderSource = prefill.contractSource;
  if (shouldApply("volumeChangeMode", next.volumeChangeMode, prefill.volumeChangeMode)) next.volumeChangeMode = prefill.volumeChangeMode;

  const paymentNotes = [prefill.paymentTerms, prefill.advanceTerms, prefill.acceptanceTerms, prefill.duration, prefill.retention].filter(Boolean).join("\n");
  if (shouldApply("paymentTerms", next.paymentNotes, paymentNotes)) next.paymentNotes = paymentNotes;
  return next;
}

export function validateContractPrefillResult(result: ContractProjectPrefill) {
  return {
    ok: result.warnings.length === 0 || Object.keys(result.confidenceByField).length > 0,
    warnings: result.warnings,
    missingFields: result.missingFields
  };
}
