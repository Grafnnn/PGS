export type ProjectWorkbookQualityStatus = "ready" | "review_required" | "blocked";
export type ProjectWorkbookQualitySeverity = "blocker" | "warning" | "info";
export type ProjectWorkbookQualityCategory = "structure" | "mapping" | "financial" | "formulas" | "duplicates" | "coverage" | "module";

export interface ProjectWorkbookQualityIssue {
  id: string;
  severity: ProjectWorkbookQualitySeverity;
  category: ProjectWorkbookQualityCategory;
  title: string;
  detail: string;
  action: string;
  sheetName?: string;
}

export interface ProjectWorkbookQualityGate {
  status: ProjectWorkbookQualityStatus;
  score: number;
  acknowledgementRequired: boolean;
  issues: ProjectWorkbookQualityIssue[];
  metrics: {
    recognizedRecords: number;
    reviewSheets: number;
    duplicateRows: number;
    formulaCells: number;
    hiddenRows: number;
    sourceDirectCost?: number;
    estimatedDirectCost: number;
    reconciliationGap: number;
    coveragePercent: number;
    blockers: number;
    warnings: number;
    information: number;
  };
}

export interface ProjectWorkbookQualityInput {
  errors: string[];
  warnings: string[];
  sheets: Array<{
    sheetName: string;
    role: string;
    enabled: boolean;
    overridden: boolean;
    confidence: number;
    importedRows: number;
    formulaCells: number;
    hiddenRows: number;
  }>;
  budgetItems: number;
  materials: number;
  scheduleItems: number;
  payrollItems: number;
  equipmentItems: number;
  estimatedDirectCost: number;
  sourceDirectCost?: number;
  reconciliationGap: number;
  duplicateRows: number;
}

const workingRoles = new Set(["works", "materials", "schedule", "payroll", "equipment"]);

export function buildProjectWorkbookQualityGate(input: ProjectWorkbookQualityInput): ProjectWorkbookQualityGate {
  const issues: ProjectWorkbookQualityIssue[] = [];
  const push = (issue: ProjectWorkbookQualityIssue) => {
    if (!issues.some((current) => current.id === issue.id)) issues.push(issue);
  };

  input.errors.forEach((error, index) => push({
    id: `parser-error-${index + 1}`,
    severity: "blocker",
    category: "structure",
    title: "Ошибка чтения или структуры Excel",
    detail: error,
    action: "Исправьте файл или его карту листов и запустите анализ повторно."
  }));

  const recognizedRecords = input.budgetItems + input.materials + input.scheduleItems;
  if (input.budgetItems === 0) {
    push({
      id: "budget-empty",
      severity: "blocker",
      category: "module",
      title: "ВОР и расходная часть не распознаны",
      detail: "В книге нет рабочих, материальных, ФОТ или технических строк, которые можно безопасно записать в бюджет проекта.",
      action: "Назначьте правильную роль детальному листу или проверьте заголовки наименования, единицы, количества и цены."
    });
  }

  const reviewSheets = input.sheets.filter((sheet) => sheet.enabled && !sheet.overridden && (sheet.role === "unknown" || sheet.confidence < 0.8));
  if (reviewSheets.length) {
    push({
      id: "sheet-mapping-review",
      severity: "warning",
      category: "mapping",
      title: `Требуют проверки листы: ${reviewSheets.length}`,
      detail: reviewSheets.slice(0, 6).map((sheet) => sheet.sheetName).join(" · ") + (reviewSheets.length > 6 ? ` · +${reviewSheets.length - 6}` : ""),
      action: "Подтвердите роль каждого листа или исключите его из импорта."
    });
  }

  input.sheets
    .filter((sheet) => sheet.enabled && sheet.overridden && workingRoles.has(sheet.role) && sheet.importedRows === 0)
    .slice(0, 8)
    .forEach((sheet) => push({
      id: `manual-empty-${stableId(sheet.sheetName)}`,
      severity: "warning",
      category: "mapping",
      title: "Ручная роль не дала рабочих строк",
      detail: `Лист «${sheet.sheetName}» назначен как ${sheet.role}, но из него не распознано ни одной строки.`,
      action: "Проверьте заголовки и структуру листа или исключите его из карты.",
      sheetName: sheet.sheetName
    }));

  const gapAbsolute = Math.abs(input.reconciliationGap);
  const gapPercent = input.sourceDirectCost && input.sourceDirectCost > 0 ? (gapAbsolute / input.sourceDirectCost) * 100 : 0;
  if (input.sourceDirectCost && gapPercent > 1) {
    push({
      id: "financial-reconciliation-gap",
      severity: "warning",
      category: "financial",
      title: "Есть разрыв со сводом прямых затрат",
      detail: `${Math.round(gapAbsolute).toLocaleString("ru-RU")} ₽ (${gapPercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%). ${input.reconciliationGap > 0 ? "Детализация ниже свода." : "Детализация выше свода."}`,
      action: "Проверьте исключённые листы, двойной учёт материалов и нераспределённые статьи до commit."
    });
  }

  const formulaCells = input.sheets.filter((sheet) => sheet.enabled).reduce((sum, sheet) => sum + sheet.formulaCells, 0);
  if (formulaCells > 0) {
    push({
      id: "saved-formula-values",
      severity: "warning",
      category: "formulas",
      title: "Excel содержит формулы",
      detail: `Обнаружено ячеек с формулами: ${formulaCells}. Сервер использует сохранённые в файле значения и не пересчитывает формулы.`,
      action: "Перед загрузкой пересчитайте и сохраните книгу в Excel, затем сверьте контрольные суммы."
    });
  }

  if (input.duplicateRows > 0) {
    push({
      id: "deduplicated-rows",
      severity: "warning",
      category: "duplicates",
      title: "Обнаружены возможные дубли",
      detail: `Из рабочего набора исключено повторов: ${input.duplicateRows}.`,
      action: "Проверьте, что одинаковые позиции действительно являются дублями, а не разными этапами или зонами."
    });
  }

  const hiddenRows = input.sheets.filter((sheet) => sheet.enabled).reduce((sum, sheet) => sum + sheet.hiddenRows, 0);
  if (hiddenRows > 0) {
    push({
      id: "hidden-rows",
      severity: "info",
      category: "structure",
      title: "В книге есть скрытые строки",
      detail: `Скрытых строк: ${hiddenRows}. Они не должны незаметно менять рабочий импорт.`,
      action: "Проверьте скрытые строки в исходном Excel, если они содержат актуальные объёмы."
    });
  }

  if (!input.sourceDirectCost) {
    push({
      id: "source-total-missing",
      severity: "info",
      category: "coverage",
      title: "Свод прямых затрат не найден",
      detail: "Автоматическая финансовая сверка выполнена только по распознанной детализации.",
      action: "Добавьте или назначьте лист ССР/свода, если контрольная сумма есть в исходных данных."
    });
  }

  if (input.payrollItems === 0) {
    push({
      id: "payroll-not-found",
      severity: "info",
      category: "module",
      title: "ФОТ не найден",
      detail: "Расходная часть не содержит отдельного расчёта собственных ИТР или привлечённых рабочих.",
      action: "Если в книге есть ФОТ, назначьте листу роль ФОТ и проверьте норму выработки и месячную зарплату."
    });
  }

  if (input.scheduleItems === 0) {
    push({
      id: "schedule-not-found",
      severity: "info",
      category: "module",
      title: "Сводный график не найден",
      detail: "Проект будет создан без автоматически заполненного календарного графика.",
      action: "Назначьте лист графика или сформируйте draft графика после создания проекта."
    });
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const information = issues.filter((issue) => issue.severity === "info").length;
  const status: ProjectWorkbookQualityStatus = blockers > 0 ? "blocked" : warnings > 0 ? "review_required" : "ready";
  const score = Math.max(0, Math.min(100, 100 - blockers * 35 - warnings * 8 - information * 2));
  const coveragePercent = input.sourceDirectCost && input.sourceDirectCost > 0
    ? Math.max(0, Math.min(100, Math.round(((input.sourceDirectCost - Math.max(0, input.reconciliationGap)) / input.sourceDirectCost) * 100)))
    : recognizedRecords > 0 ? 100 : 0;

  return {
    status,
    score,
    acknowledgementRequired: status === "review_required",
    issues,
    metrics: {
      recognizedRecords,
      reviewSheets: reviewSheets.length,
      duplicateRows: input.duplicateRows,
      formulaCells,
      hiddenRows,
      sourceDirectCost: input.sourceDirectCost,
      estimatedDirectCost: input.estimatedDirectCost,
      reconciliationGap: input.reconciliationGap,
      coveragePercent,
      blockers,
      warnings,
      information
    }
  };
}

export function failedProjectWorkbookQualityGate(error: string): ProjectWorkbookQualityGate {
  return buildProjectWorkbookQualityGate({
    errors: [error],
    warnings: [],
    sheets: [],
    budgetItems: 0,
    materials: 0,
    scheduleItems: 0,
    payrollItems: 0,
    equipmentItems: 0,
    estimatedDirectCost: 0,
    reconciliationGap: 0,
    duplicateRows: 0
  });
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "sheet";
}
