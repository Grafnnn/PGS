import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import type { Material, Payment, ProcurementRequest, Project } from "@/lib/types";

export const ACCOUNTING_BRIDGE_VERSION = "pgs-accounting-bridge-v1";
export const ACCOUNTING_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export type AccountingSourceSystem = "1c" | "sbis" | "kontur" | "excel" | "other";
export type AccountingMatchStatus = "matched" | "ambiguous" | "unmatched" | "conflict";

export type AccountingImportRow = {
  rowNumber: number;
  externalId?: string;
  date: string;
  counterparty: string;
  direction: "incoming" | "outgoing";
  amount: number;
  status: "planned" | "approved" | "paid";
  purpose: string;
  currency: string;
};

export type AccountingImportMatch = {
  row: AccountingImportRow;
  status: AccountingMatchStatus;
  paymentId?: string;
  paymentTitle?: string;
  score: number;
  reasons: string[];
  action: "mark_paid" | "link_only" | "none";
};

export type AccountingImportPreview = {
  bridgeVersion: string;
  sourceSystem: AccountingSourceSystem;
  fileName: string;
  checksum: string;
  rows: AccountingImportRow[];
  matches: AccountingImportMatch[];
  summary: {
    total: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
    conflicts: number;
    safeToApply: number;
    amount: number;
    matchedAmount: number;
  };
  warnings: string[];
};

export type AccountingExternalLinkInput = {
  externalSystem: string;
  externalId: string;
  entityId: string;
};

type RawRow = Record<string, unknown>;

const headerAliases = {
  externalId: ["externalid", "external_id", "идентификатор", "id", "номер", "номердокумента", "документ"],
  date: ["date", "paymentdate", "payment_date", "дата", "датаоперации", "датаоплаты", "датаплатежа"],
  counterparty: ["counterparty", "контрагент", "получатель", "плательщик", "организация"],
  direction: ["direction", "направление", "операция", "тип", "видоперации"],
  amount: ["amount", "сумма", "суммаплатежа", "итого"],
  status: ["status", "статус", "состояние"],
  purpose: ["purpose", "назначение", "назначениеплатежа", "описание", "комментарий"],
  currency: ["currency", "валюта", "кодвалюты"]
} as const;

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[ё]/g, "е").replace(/[^a-zа-я0-9_]/g, "");
}

function normalizedText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function valueFor(row: RawRow, aliases: readonly string[]) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    if (aliases.includes(normalizedKey(key))) return value;
  }
  return undefined;
}

function parseAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = normalizedText(value).replace(/\u00a0/g, "").replace(/\s/g, "").replace(/[()]/g, (token) => (token === "(" ? "-" : ""));
  const normalized = text.includes(",") && text.includes(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(",", ".");
  const result = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(result) ? result : 0;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = normalizedText(value);
  const ru = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function parseDirection(value: unknown, amount: number): AccountingImportRow["direction"] | null {
  const text = normalizedKey(normalizedText(value));
  if (["incoming", "credit", "приход", "поступление", "входящий", "доход"].some((token) => text.includes(token))) return "incoming";
  if (["outgoing", "debit", "расход", "списание", "исходящий", "оплата"].some((token) => text.includes(token))) return "outgoing";
  if (amount < 0) return "outgoing";
  return null;
}

function parseStatus(value: unknown): AccountingImportRow["status"] {
  const text = normalizedKey(normalizedText(value));
  if (["paid", "оплачен", "исполнен", "проведен", "проведена", "проведено"].some((token) => text.includes(token))) return "paid";
  if (["approved", "согласован", "утвержден"].some((token) => text.includes(token))) return "approved";
  if (["planned", "план", "подготовлен"].some((token) => text.includes(token))) return "planned";
  return "paid";
}

function parseRawRows(buffer: Buffer, fileName: string): RawRow[] {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "json") {
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? ((parsed as Record<string, unknown>).rows ?? (parsed as Record<string, unknown>).payments ?? (parsed as Record<string, unknown>).transactions)
        : null;
    if (!Array.isArray(rows)) throw new Error("JSON должен содержать массив rows, payments или transactions.");
    return rows.filter((row): row is RawRow => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }

  const workbook = extension === "csv"
    ? XLSX.read(buffer.toString("utf8"), { type: "string", cellDates: true })
    : XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("В файле нет листов с операциями.");
  return XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[firstSheet], { defval: "", raw: true });
}

export function parseAccountingImportFile(buffer: Buffer, fileName: string) {
  if (!buffer.byteLength) throw new Error("Файл пуст.");
  if (buffer.byteLength > ACCOUNTING_IMPORT_MAX_BYTES) throw new Error("Файл превышает лимит 5 МБ.");
  if (!/\.(xlsx|xls|csv|json)$/i.test(fileName)) throw new Error("Поддерживаются XLSX, XLS, CSV и JSON.");

  const rawRows = parseRawRows(buffer, fileName);
  const warnings: string[] = [];
  const rows: AccountingImportRow[] = [];

  rawRows.forEach((raw, index) => {
    const signedAmount = parseAmount(valueFor(raw, headerAliases.amount));
    const direction = parseDirection(valueFor(raw, headerAliases.direction), signedAmount);
    const date = parseDate(valueFor(raw, headerAliases.date));
    const currency = normalizedText(valueFor(raw, headerAliases.currency) || "RUB").toUpperCase();
    if (!signedAmount || !direction || !date) {
      warnings.push(`Строка ${index + 2}: не определены дата, сумма или направление.`);
      return;
    }
    if (!["RUB", "RUR", "РУБ", "643"].includes(currency)) {
      warnings.push(`Строка ${index + 2}: валюта ${currency} не поддерживается в v1.`);
      return;
    }
    rows.push({
      rowNumber: index + 2,
      externalId: normalizedText(valueFor(raw, headerAliases.externalId)) || undefined,
      date,
      counterparty: normalizedText(valueFor(raw, headerAliases.counterparty)),
      direction,
      amount: Math.abs(signedAmount),
      status: parseStatus(valueFor(raw, headerAliases.status)),
      purpose: normalizedText(valueFor(raw, headerAliases.purpose)),
      currency: "RUB"
    });
  });

  if (!rows.length) throw new Error("Не найдено ни одной корректной финансовой операции.");
  return { rows, warnings, checksum: createHash("sha256").update(buffer).digest("hex") };
}

function dayDistance(first: string, second: string) {
  return Math.abs(new Date(`${first}T00:00:00Z`).getTime() - new Date(`${second}T00:00:00Z`).getTime()) / 86_400_000;
}

function textScore(first: string, second: string) {
  const a = normalizedKey(first);
  const b = normalizedKey(second);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const tokens = new Set(a.match(/[a-zа-я0-9]{3,}/g) ?? []);
  const other = new Set(b.match(/[a-zа-я0-9]{3,}/g) ?? []);
  const shared = [...tokens].filter((token) => other.has(token)).length;
  return shared / Math.max(tokens.size, other.size, 1);
}

function candidateScore(row: AccountingImportRow, payment: Payment) {
  if (row.direction !== payment.direction || Math.abs(row.amount - payment.amount) > 0.01) return { score: 0, reasons: [] as string[] };
  let score = 60;
  const reasons = ["совпали направление и сумма"];
  const distance = dayDistance(row.date, payment.paidAt ?? payment.plannedAt);
  if (distance <= 3) {
    score += 20;
    reasons.push("дата в пределах 3 дней");
  } else if (distance <= 10) {
    score += 10;
    reasons.push("дата в пределах 10 дней");
  }
  const counterparty = textScore(row.counterparty, payment.counterparty);
  if (counterparty >= 0.8) {
    score += 15;
    reasons.push("совпал контрагент");
  } else if (counterparty >= 0.4) {
    score += 8;
    reasons.push("контрагент похож");
  }
  if (textScore(row.purpose, payment.title) >= 0.5) {
    score += 5;
    reasons.push("совпало назначение");
  }
  return { score, reasons };
}

export function buildAccountingImportPreview(input: {
  sourceSystem: AccountingSourceSystem;
  fileName: string;
  checksum: string;
  rows: AccountingImportRow[];
  payments: Payment[];
  links?: AccountingExternalLinkInput[];
  warnings?: string[];
}): AccountingImportPreview {
  const linkByExternalId = new Map((input.links ?? []).filter((link) => link.externalSystem === input.sourceSystem).map((link) => [link.externalId, link.entityId]));
  const linkByEntityId = new Map((input.links ?? []).filter((link) => link.externalSystem === input.sourceSystem).map((link) => [link.entityId, link.externalId]));
  const paymentById = new Map(input.payments.map((payment) => [payment.id, payment]));

  const matches = input.rows.map<AccountingImportMatch>((row) => {
    const linkedPaymentId = row.externalId ? linkByExternalId.get(row.externalId) : undefined;
    if (linkedPaymentId) {
      const payment = paymentById.get(linkedPaymentId);
      if (!payment || payment.direction !== row.direction || Math.abs(payment.amount - row.amount) > 0.01) {
        return { row, status: "conflict", paymentId: payment?.id, paymentTitle: payment?.title, score: 100, reasons: ["внешний ID уже связан с другой суммой или направлением"], action: "none" };
      }
      return {
        row,
        status: "matched",
        paymentId: payment.id,
        paymentTitle: payment.title,
        score: 100,
        reasons: ["найдена сохраненная связь с внешним ID"],
        action: row.status === "paid" && payment.status !== "paid" ? "mark_paid" : "link_only"
      };
    }

    const candidates = input.payments
      .map((payment) => ({ payment, ...candidateScore(row, payment) }))
      .filter((candidate) => candidate.score >= 60)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 75) return { row, status: "unmatched", score: best?.score ?? 0, reasons: best?.reasons ?? ["нет надежного совпадения"], action: "none" };
    if (candidates[1] && best.score - candidates[1].score < 10) {
      return { row, status: "ambiguous", score: best.score, reasons: [...best.reasons, "найдено несколько близких платежей"], action: "none" };
    }
    const existingExternalId = linkByEntityId.get(best.payment.id);
    if (row.externalId && existingExternalId && existingExternalId !== row.externalId) {
      return { row, status: "conflict", paymentId: best.payment.id, paymentTitle: best.payment.title, score: best.score, reasons: [...best.reasons, "платеж уже связан с другим внешним ID"], action: "none" };
    }
    return {
      row,
      status: "matched",
      paymentId: best.payment.id,
      paymentTitle: best.payment.title,
      score: best.score,
      reasons: best.reasons,
      action: row.status === "paid" && best.payment.status !== "paid" ? "mark_paid" : "link_only"
    };
  });

  const paymentMatchCounts = new Map<string, number>();
  for (const match of matches) {
    if (match.status === "matched" && match.paymentId) paymentMatchCounts.set(match.paymentId, (paymentMatchCounts.get(match.paymentId) ?? 0) + 1);
  }
  const uniqueMatches = matches.map((match) => {
    if (match.status !== "matched" || !match.paymentId || (paymentMatchCounts.get(match.paymentId) ?? 0) < 2) return match;
    return { ...match, status: "ambiguous" as const, action: "none" as const, reasons: [...match.reasons, "несколько строк претендуют на один платеж PGS"] };
  });

  const summary = {
    total: uniqueMatches.length,
    matched: uniqueMatches.filter((match) => match.status === "matched").length,
    ambiguous: uniqueMatches.filter((match) => match.status === "ambiguous").length,
    unmatched: uniqueMatches.filter((match) => match.status === "unmatched").length,
    conflicts: uniqueMatches.filter((match) => match.status === "conflict").length,
    safeToApply: uniqueMatches.filter((match) => match.status === "matched" && Boolean(match.paymentId)).length,
    amount: uniqueMatches.reduce((sum, match) => sum + match.row.amount, 0),
    matchedAmount: uniqueMatches.filter((match) => match.status === "matched").reduce((sum, match) => sum + match.row.amount, 0)
  };

  return { bridgeVersion: ACCOUNTING_BRIDGE_VERSION, sourceSystem: input.sourceSystem, fileName: input.fileName, checksum: input.checksum, rows: input.rows, matches: uniqueMatches, summary, warnings: input.warnings ?? [] };
}

export function buildAccountingExport(input: {
  project: Project;
  costCodes?: Array<{ id: string; code: string; name: string }>;
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  generatedAt?: string;
}) {
  const costCodeById = new Map((input.costCodes ?? []).map((item) => [item.id, { code: item.code, name: item.name }]));
  const costCode = (costCodeId?: string | null) => costCodeId ? costCodeById.get(costCodeId) ?? null : null;
  const materialPriceById = new Map(input.materials.map((material) => [material.id, material.plannedUnitPrice]));
  const materialPriceByName = new Map(input.materials.map((material) => [normalizedKey(material.name), material.plannedUnitPrice]));
  const commitments = input.procurementRequests.map((request) => {
    const lines = request.items.map((item) => {
      const unitPrice = materialPriceById.get(item.materialId) ?? materialPriceByName.get(normalizedKey(item.name)) ?? 0;
      return { materialId: item.materialId || null, costCode: costCode(item.costCodeId), name: item.name, qty: item.qty, unit: item.unit, unitPrice, amount: item.qty * unitPrice, estimateStatus: unitPrice ? "estimated" : "missing_price" };
    });
    return { id: request.id, title: request.title, status: request.status, neededAt: request.neededAt, priority: request.priority, amount: lines.reduce((sum, line) => sum + line.amount, 0), lines };
  });
  const receivables = input.payments.filter((payment) => payment.direction === "incoming");
  const payables = input.payments.filter((payment) => payment.direction === "outgoing");
  const accountingPayment = (payment: Payment) => ({ ...payment, costCode: costCode(payment.costCodeId) });
  const sum = (items: Payment[]) => items.reduce((total, payment) => total + payment.amount, 0);

  return {
    schema: ACCOUNTING_BRIDGE_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    project: {
      id: input.project.id,
      code: input.project.code ?? null,
      name: input.project.name,
      customer: input.project.customer,
      object: input.project.object,
      contractAmount: input.project.contractAmount,
      vatMode: input.project.vatMode,
      vatPercent: input.project.vatPercent ?? null,
      startsAt: input.project.startsAt,
      endsAt: input.project.endsAt
    },
    commitments,
    receivables: receivables.map(accountingPayment),
    payables: payables.map(accountingPayment),
    totals: {
      contractAmount: input.project.contractAmount,
      commitments: commitments.reduce((total, item) => total + item.amount, 0),
      receivables: sum(receivables),
      payables: sum(payables),
      paidIncoming: sum(receivables.filter((payment) => payment.status === "paid")),
      paidOutgoing: sum(payables.filter((payment) => payment.status === "paid"))
    },
    limitations: [
      "Обязательства по закупкам оценены по плановым ценам материалов.",
      "Входящие платежи используются как контур начислений/оплат; отдельный реестр счетов появится в следующей версии.",
      "Пакет не создает проводки во внешней системе автоматически."
    ]
  };
}
