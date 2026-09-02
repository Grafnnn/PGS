import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeProjectWorkbookBuffer, parseProjectWorkbookBuffer, parseProjectWorkbookSheetOverrides } from "./project-workbook-import";

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Сводная стоимость проекта"],
    ["Наименование проекта", "Жилой дом Северный"],
    ["Код проекта", "PGS-NORTH-01"],
    ["Заказчик", "ООО Северный заказчик"],
    ["Адрес объекта", "г. Москва, Северная улица, 1"],
    ["Руководитель проекта", "Иван Петров"],
    ["Дата начала", "01.08.2026"],
    ["Дата окончания", "31.10.2026"],
    ["Условия оплаты", "Аванс 20%, оплата по КС"],
    ["Раздел", "Итого без НДС, ₽", "НДС, ₽", "Итого с НДС, ₽"],
    ["ИТОГО прямые затраты", 4200, 924, 5124],
    ["ИТОГОВАЯ ЦЕНА ГЕНПОДРЯДА", 5000],
    ["Ставка НДС", 0.22]
  ]), "01_ССР_КП");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["01. Земляные работы"],
    [],
    ["Источник / группа", "№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽", "Стоимость работ без НДС, ₽", "Примечание"],
    ["ВОР", 1, "Разработка грунта", "м3", 2, 100, 200, ""],
    ["", "", "", "", "", "Итого работы/надбавки без НДС:", 200]
  ]), "Р01_Земляные работы");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Материалы"],
    ["Раздел", "№", "Позиция", "Ед. мат.", "Кол-во мат.", "Цена с НДС", "Стоимость с НДС", "Источник/основание"],
    ["Земляные работы", 1, "Песок", "м3", 10, 122, 1220, "КП"]
  ]), "05_Материалы");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Календарный график"],
    ["Код", "Раздел", "Этап", "M1", "M2", "M3"],
    [1, "Земляные работы", "Физика СМР", 100, 100, 0]
  ]), "13_Календарь_3мес");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["ИТР и управление — ФОТ"],
    ["№", "Должность", "Функция", "ФОТ 1 ед./мес, ₽", "Чел-Мес всего", "Итого ФОТ без НДС, ₽", "M1", "M2", "Примечание"],
    [1, "Руководитель проекта", "Управление", 1000, 2, 2000, 1, 1, ""],
    ["ИТОГО", "", "", "", 2, 2000]
  ]), "23_ИТР_ФОТ");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Машины и механизмы"],
    ["№", "Техника / механизм", "Вид работ / этап", "Ед.", "Кол-во ед.", "Смен всего", "Расценка без НДС, ₽/смена", "Итого без НДС, ₽", "M1", "M2"],
    [1, "Экскаватор", "Котлован", "смена", 1, 2, 500, 1000, 2, 0],
    ["ИТОГО", "", "", "", "", 2, "", 1000]
  ]), "22_Машины_механизмы");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Проверка", "Комментарий"], ["ok", "reference only"]]), "18_Контроль");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("project workbook import", () => {
  it("classifies a multi-sheet project workbook and reconciles modules without summary duplication", () => {
    const analysis = analyzeProjectWorkbookBuffer(workbookBuffer(), "project.xlsx", "preview", { startsAt: "2026-07-01" });

    expect(analysis.errors).toEqual([]);
    expect(analysis.suggestions).toMatchObject({
      name: "Жилой дом Северный",
      code: "PGS-NORTH-01",
      customer: "ООО Северный заказчик",
      object: "Жилой дом Северный",
      objectType: "residential",
      address: "г. Москва, Северная улица, 1",
      manager: "Иван Петров",
      startsAt: "2026-08-01",
      endsAt: "2026-10-31",
      paymentNotes: "Аванс 20%, оплата по КС",
      templateId: "general_construction",
      contractAmount: 5000,
      vatPercent: 22,
      durationMonths: 2
    });
    expect(analysis.suggestions.selectedModules).toEqual(expect.arrayContaining(["vor", "documents", "schedule", "materials", "acceptance", "risks", "contract", "reports"]));
    expect(analysis.suggestions.confidenceByField.customer).toBe("high");
    expect(analysis.suggestions.evidenceByField.customer).toContain("01_ССР_КП");
    expect(analysis.suggestions.missingFields).toEqual([]);
    expect(analysis.summary).toMatchObject({
      budgetItems: 4,
      materials: 1,
      scheduleItems: 1,
      payrollItems: 1,
      equipmentItems: 1,
      workforceDemandRows: 1,
      laborAllocationRows: 0,
      sourceDirectCost: 4200,
      reconciliationGap: 0,
      automatedCoveragePercent: 100
    });
    expect(analysis.summary.estimatedDirectCost).toBeCloseTo(4200);
    expect(analysis.quality).toMatchObject({
      status: "ready",
      acknowledgementRequired: false,
      metrics: { recognizedRecords: 6, coveragePercent: 100, blockers: 0, warnings: 0 }
    });
    expect(analysis.modules.find((module) => module.id === "source_control")?.sheets).toContain("01_ССР_КП");
    expect(analysis.modules.find((module) => module.id === "procurement")).toMatchObject({ status: "derived" });
    expect(analysis.modules.find((module) => module.id === "cashflow")).toMatchObject({ status: "derived" });
    expect(analysis.modules.find((module) => module.id === "intelligence")).toMatchObject({ status: "derived" });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "01_ССР_КП")).toMatchObject({ role: "summary", included: false });
  });

  it("creates payroll expense from volume and monthly output norm", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["ФОТ привлеченных рабочих"],
      ["Профессия", "Месячная зарплата", "Норма выработки", "Объем работ"],
      ["Монтажник", 120000, 50, 200],
      ["ИТОГО"]
    ]), "ФОТ рабочих");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Монтажные работы"],
      ["№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽"],
      [1, "Монтаж металлоконструкций", "т", 200, 1000]
    ]), "ВОР Монтаж");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Календарный график"],
      ["Раздел", "M1", "M2"],
      ["Монтаж", 1, 1]
    ]), "График");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Итог"], ["справочно"]]), "Итог");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = parseProjectWorkbookBuffer(buffer, "labor.xlsx", "project", { startsAt: "2026-07-01" });
    const payroll = preview.budgetItems.find((item) => item.kind === "payroll");
    const demand = preview.laborDemands?.[0];
    if (!demand) throw new Error("Expected labor demand from payroll sheet");

    expect(payroll).toMatchObject({ name: "Монтажник", unit: "чел.-мес.", qty: 4, plannedUnitPrice: 120000, actualUnitPrice: 0 });
    expect(payroll?.comment).toContain("Норма выработки: 50");
    expect(payroll?.comment).toContain("Объем для расчета: 200");
    expect(demand).toMatchObject({
      category: "worker",
      profession: "Монтажник",
      grossMonthlySalary: 120000,
      personMonths: 4,
      plannedHours: 640
    });
    expect(demand.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        budgetName: "Монтаж металлоконструкций",
        plannedHours: 640,
        confidence: expect.any(Number)
      })
    ]));
    expect(demand.allocations.reduce((sum, item) => sum + item.sharePercent, 0)).toBe(100);
  });

  it("maps labor to VOR by operation id without unrelated cost-based fallback", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Монолитные работы"],
      [],
      ["Источник / группа", "№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽", "Стоимость работ без НДС, ₽", "Примечание"],
      ["ВОР", 1, "Установка арматуры", "т", 4, 10_000, 40_000, "код графика: K-15 | ID: K-15.1, K-15.2"],
      ["ВОР", 2, "Устройство кровли", "м2", 100, 500, 50_000, "код графика: R-09 | ID: R-09.1, R-09.2"]
    ]), "Р01_Монолит");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["ФОТ рабочих"],
      ["Профессия", "Функция", "Месячная зарплата", "Чел-Мес всего", "M1", "Примечание"],
      ["Арматурное звено З1", "Армирование монолитных участков", 120_000, 1, 1, "ID K-15.1"],
      ["Разнорабочий", "Нераспределенные вспомогательные работы", 80_000, 1, 1, "Связь с ВОР не задана"]
    ]), "24_Рабочие_ФОТ");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Календарный график"],
      ["Код", "Раздел", "Этап", "M1"],
      ["K-15", "Монолит", "Армирование", 40_000]
    ]), "13_Календарь");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = parseProjectWorkbookBuffer(buffer, "labor-ids.xlsx", "project", { startsAt: "2026-07-01" });
    const rebar = preview.laborDemands?.find((item) => item.profession === "Арматурное звено З1");
    const helper = preview.laborDemands?.find((item) => item.profession === "Разнорабочий");

    expect(rebar?.allocations).toEqual([
      expect.objectContaining({
        budgetName: "Установка арматуры",
        sharePercent: 100,
        reason: "Распределено по точному коду операции из ФОТ и строки ВОР."
      })
    ]);
    expect(helper?.allocations).toEqual([]);
  });

  it("reconciles database precision rounding to the source direct cost", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Сводная стоимость проекта"],
      ["Раздел", "Итого без НДС, ₽", "НДС, ₽", "Итого с НДС, ₽"],
      ["ИТОГО прямые затраты", 58_748.05, 12_924.57, 71_672.62],
      ["ИТОГОВАЯ ЦЕНА ГЕНПОДРЯДА", 70_000]
    ]), "01_ССР_КП");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Монолитные работы"],
      [],
      ["Источник / группа", "№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽", "Стоимость работ без НДС, ₽", "Примечание"],
      ["ВОР", 1, "Установка арматуры", "т", 4.1227, 14_250.0006064, 58_748.05, "ID: K-15.1"]
    ]), "Р01_Монолит");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Календарный график"],
      ["Код", "Раздел", "Этап", "M1", "M2", "M3"],
      ["K-15", "Монолит", "Армирование", 58_748.05, 0, 0]
    ]), "13_Календарь");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const analysis = analyzeProjectWorkbookBuffer(buffer, "rounding.xlsx", "project", { startsAt: "2026-07-01" });
    const preview = parseProjectWorkbookBuffer(buffer, "rounding.xlsx", "project", { startsAt: "2026-07-01" });
    const work = preview.budgetItems.find((item) => item.kind === "work");

    expect(analysis.summary).toMatchObject({ budgetItems: 1, sourceDirectCost: 58_748.05, reconciliationGap: 0 });
    expect(analysis.summary.estimatedDirectCost).toBeCloseTo(58_748.05, 2);
    expect(work?.plannedUnitPrice).toBeGreaterThan(0);
    expect(work?.comment).toContain("Корректировка округления при сохранении");
    expect(preview.warnings).toContainEqual(expect.stringContaining("Скорректировано округление"));
  });

  it("keeps sparse resource rows for review and classifies summary and control before broad work heuristics", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Название проекта", "Кровля лабораторного корпуса"],
      ["ИТОГОВАЯ ЦЕНА ГЕНПОДРЯДА", 1_220_000],
      ["Ставка НДС", 0.22],
      ["Раздел", "Итого без НДС, ₽"],
      ["ИТОГО прямые затраты", 1_000_000]
    ]), "01_ССР_КП");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽"],
      [1, "Устройство кровли", "м2", 100, 10_000]
    ]), "Р01_Кровля");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Раздел", "№", "Позиция", "Ед. мат.", "Кол-во мат.", "Цена без НДС, ₽", "Стоимость без НДС, ₽", "Источник/основание"],
      ["Кровля", 1, "Мембрана", "м2", 120, "", "", "Ведомость"],
      ["Кровля", 2, "Крепеж", "шт", "", "", "", "Требует уточнения"]
    ]), "05_Материалы");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["№", "Профессия", "Функция", "Месячная зарплата", "Численность", "Чел-Мес всего", "M1"],
      [1, "Кровельщик", "Устройство кровли", "", 4, 4, 4]
    ]), "24_Рабочие_ФОТ");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["№", "Техника / механизм", "Вид работ / этап", "Ед.", "Кол-во ед.", "Смен всего", "Расценка без НДС, ₽/смена", "Итого без НДС, ₽"],
      [1, "Кран", "Подъем материалов", "смена", "", "", "", ""]
    ]), "22_Машины_механизмы");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Тип проверки", "Описание"],
      ["ВОР", "Наименование работ и стоимость работ требуют проверки"],
      ["Прямые затраты", "ИТОГО прямые затраты нужно сверить"]
    ]), "18_Контроль");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const analysis = analyzeProjectWorkbookBuffer(buffer, "sparse.xlsx");
    const preview = parseProjectWorkbookBuffer(buffer, "sparse.xlsx", "project");

    expect(analysis.sheets.find((sheet) => sheet.sheetName === "01_ССР_КП")?.role).toBe("summary");
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "18_Контроль")?.role).toBe("control");
    expect(analysis.summary).toMatchObject({
      sourceDirectCost: 1_000_000,
      reconciliationGap: 0,
      materials: 2,
      payrollItems: 1,
      workforceDemandRows: 1,
      equipmentItems: 1
    });
    expect(preview.materials).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Мембрана", requiredQty: 120, plannedUnitPrice: 0 }),
      expect.objectContaining({ name: "Крепеж", requiredQty: 0, plannedUnitPrice: 0 })
    ]));
    expect(preview.laborDemands?.[0]).toMatchObject({ profession: "Кровельщик", grossMonthlySalary: 0, personMonths: 4 });
    expect(analysis.quality).toMatchObject({
      status: "review_required",
      acknowledgementRequired: true,
      metrics: {
        unpricedMaterials: 2,
        unquantifiedMaterials: 1,
        unpricedPayroll: 1,
        unpricedEquipment: 1,
        unquantifiedEquipment: 1
      }
    });
    expect(analysis.quality.issues.map((issue) => issue.id)).toEqual(expect.arrayContaining([
      "materials-missing-price",
      "materials-missing-quantity",
      "payroll-missing-salary",
      "equipment-missing-inputs"
    ]));
  });

  it("fills a missing worker norm from a reliable workbook average", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["ФОТ привлеченных рабочих"],
      ["Профессия", "Функция", "Месячная зарплата", "Чел-Мес всего", "Норма выработки", "Примечание"],
      ["Каменщик", "Кладка стен м2", 120000, 2, 90, "м2"],
      ["Каменщик", "Кладка стен м2", 120000, 2, 110, "м2"],
      ["Каменщик", "Кладка стен м2", 120000, 2, "", "м2"],
      ["ИТОГО"]
    ]), "ФОТ рабочих");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Каменные работы"],
      ["№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽"],
      [1, "Кладка стен", "м2", 600, 1000]
    ]), "ВОР Кладка");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Календарный график"],
      ["Раздел", "M1", "M2"],
      ["Кладка", 1, 1]
    ]), "График");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = parseProjectWorkbookBuffer(buffer, "labor-average.xlsx", "project", { startsAt: "2026-07-01" });
    const demands = preview.laborDemands ?? [];

    expect(demands).toHaveLength(3);
    expect(demands[2]).toMatchObject({
      profession: "Каменщик",
      productivityNorm: 100,
      productivityUnit: "м2/чел.-мес.",
      confidence: 0.75
    });
    expect(demands[2].notes).toContain("Автонорма");
    expect(preview.warnings).toContainEqual(expect.stringContaining("Автоматически рассчитана средняя норма выработки для 1 строк ФОТ"));
  });

  it("keeps project-wide ITR unallocated and classifies a master as engineering staff", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["ИТР и управление — ФОТ"],
      ["Должность", "Функция", "ФОТ 1 ед./мес, ₽", "Чел-Мес всего"],
      ["Руководитель проекта", "Управление проектом", 250000, 3],
      ["Мастер СМР", "Управление рабочими бригадами", 150000, 3],
      ["ИТОГО"]
    ]), "23_ИТР_ФОТ");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Общестроительные работы"],
      ["№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽"],
      [1, "Строительно-монтажные работы по проекту", "компл.", 1, 1_000_000]
    ]), "ВОР Общестрой");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Календарный график"],
      ["Раздел", "M1", "M2", "M3"],
      ["Общестрой", 1, 1, 1]
    ]), "График");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Итог"], ["справочно"]]), "Итог");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = parseProjectWorkbookBuffer(buffer, "itr.xlsx", "project", { startsAt: "2026-07-01" });
    const manager = preview.laborDemands?.find((item) => item.profession === "Руководитель проекта");
    const master = preview.laborDemands?.find((item) => item.profession === "Мастер СМР");

    expect(manager).toMatchObject({ category: "engineer", allocations: [] });
    expect(master?.category).toBe("engineer");
    expect(master?.allocations).toEqual([
      expect.objectContaining({
        budgetName: "Строительно-монтажные работы по проекту",
        sharePercent: 100
      })
    ]);
  });

  it("imports a canonical commercial proposal, procurement register and weekly KS detail without duplicating source views", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Объект: Капитальный ремонт кровли, г. Троицк"],
      [],
      ["Коммерческое предложение на выполнение работ по кровле"],
      [],
      ["№ пп", "Наименование конструктивных решений (элементов), комплексов (видов) работ", "Ед.изм.", "Кол-во", "Ед. расценка", "Всего"],
      [],
      ["", "Раздел 1. Демонтажные работы"],
      [1, "Демонтаж покрытия", "м2", 10, 100, 1000],
      ["", "Раздел 2. Новая кровля"],
      [1, "Устройство мембраны", "м2", 20, 100, 2000],
      ["", "Итого:", "", "", "", 3000],
      ["", "ВСЕГО (без НДС):", "", "", "", 3000]
    ]), "КП-250826");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Source_Row_ID", "Строка сводной заявки", "Тип строки", "Пакет размещения", "Заказать / запустить до", "Окно потребности на площадке", "GPR_ID / фронт", "Вид закупки", "Заявка", "Марка / поз. РД", "Материал", "Характеристика", "Ед.", "К заказу", "Масса нетто, кг", "Вид работ", "Источник количества", "Контроль / комментарий"],
      ["SRC-1", 1, "ORDER", "Н1–2", "04.09.2026", "07.09–19.09.2026", "G01", "Кровля", "МЗ-01", "В20", "Бетон", "Плита З1", "м3", 5, "", "Монолит З1", "ВОР", "Проверить поставщика"],
      ["SRC-2", 2, "BREAKDOWN", "Н1–2", "04.09.2026", "07.09–19.09.2026", "G01", "Кровля", "МЗ-01", "B500", "Арматура", "Деталировка", "кг", 500, "", "Монолит З1", "КМД", "Не заказывать отдельно"],
      ["SRC-3", 3, "INFO-RFI", "Н3–4", "18.09.2026", "21.09–03.10.2026", "G02", "Кровля", "МЗ-02", "По РД", "Крепеж", "Тип уточнить", "шт", "", "", "Мембрана", "РД", "HOLD/RFI"]
    ]), "Реестр");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Строка КП", "Раздел / подраздел", "№", "Наименование работ", "Ед.", "Кол-во КП", "Расценка КП, ₽", "Утверждено КП, ₽", "Профиль ГПР", "Н1", "Н2", "Н3"],
      [8, "Раздел 1. Демонтажные работы", 1, "Демонтаж покрытия", "м2", 10, 100, 1000, "G01", 600, 400, 0],
      [10, "Раздел 2. Новая кровля", 1, "Устройство мембраны", "м2", 20, 100, 2000, "G02", 0, 500, 1500]
    ]), "КС детализация");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["ПРОГНОЗ ВЫПОЛНЕНИЯ КС"],
      [],
      ["Неделя", "Период", "План КС, ₽", "% КП", "План накопительно, ₽", "Факт КС, ₽", "Факт накопительно, ₽", "Отклонение", "Статус", "Ключевые работы"],
      ["Н1", "07.09–12.09", 600, 20, 600, "", "", "", "ПЛАН", "Демонтаж"]
    ]), "Прогноз КС");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Вид закупки / уровень", "Заявка", "Марка", "Материал", "Характеристика", "Ед.", "К заказу", "Масса", "Вид работ"],
      ["Кровля", "МЗ-01", "В20", "Бетон", "Плита З1", "м3", 5, "", "Монолит З1"]
    ]), "Весь объект");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const analysis = analyzeProjectWorkbookBuffer(buffer, "troitsk.xlsx", "project");
    const preview = parseProjectWorkbookBuffer(buffer, "troitsk.xlsx", "project");

    expect(analysis.errors).toEqual([]);
    expect(analysis.summary).toMatchObject({
      reviewSheets: 0,
      budgetItems: 4,
      materials: 2,
      scheduleItems: 2,
      sourceDirectCost: 3000,
      reconciliationGap: 0
    });
    expect(analysis.summary.estimatedDirectCost).toBe(3000);
    expect(analysis.suggestions).toMatchObject({
      contractAmount: 3000,
      startsAt: "2026-09-07",
      endsAt: "2026-09-26"
    });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "КП-250826")).toMatchObject({ role: "works", included: true });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "Реестр")).toMatchObject({ role: "materials", included: true });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "КС детализация")).toMatchObject({ role: "schedule", included: true });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "Прогноз КС")).toMatchObject({ role: "reference", included: false });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "Весь объект")).toMatchObject({ role: "reference", included: false });
    expect(preview.budgetItems.filter((item) => item.kind === "work")).toEqual([
      expect.objectContaining({ section: "Раздел 1. Демонтажные работы", name: "Демонтаж покрытия", qty: 10, plannedUnitPrice: 100 }),
      expect.objectContaining({ section: "Раздел 2. Новая кровля", name: "Устройство мембраны", qty: 20, plannedUnitPrice: 100 })
    ]);
    expect(preview.materials).toEqual([
      expect.objectContaining({ name: expect.stringContaining("[МЗ-01] Бетон"), requiredQty: 5, orderByAt: "2026-09-04", neededAt: "2026-09-07" }),
      expect.objectContaining({ name: expect.stringContaining("[МЗ-02] Крепеж"), requiredQty: 0, orderByAt: "2026-09-18", neededAt: "2026-09-21" })
    ]);
    expect(preview.materials.some((item) => item.name.includes("Арматура"))).toBe(false);
    expect(preview.scheduleItems).toEqual([
      expect.objectContaining({ startsAt: "2026-09-07", endsAt: "2026-09-19", plannedQty: 10 }),
      expect.objectContaining({ startsAt: "2026-09-14", endsAt: "2026-09-26", plannedQty: 20 })
    ]);
    expect(preview.previewRows?.find((row) => row.name?.includes("Крепеж"))).toMatchObject({
      status: "warning",
      suspiciousFlags: expect.arrayContaining(["missingQuantity", "missingPrice"])
    });
  });

  it("treats заявки_итог as the authoritative material list and preserves request deadlines and marks", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Коммерческое предложение"],
      [],
      ["№", "Наименование конструктивных решений", "Ед.", "Кол-во", "Ед. расценка", "Всего"],
      [1, "Монтаж металлоконструкций", "т", 1, 1000, 1000]
    ]), "КП-250826");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Source_Row_ID", "Тип строки", "Пакет размещения", "Заказать / запустить до", "Окно потребности на площадке", "Вид закупки", "Заявка", "Материал", "Марка / поз. РД", "Ед.", "К заказу"],
      ["OLD-1", "ORDER", "Н1–2", "01.09.2026", "07.09–19.09.2026", "Металл", "МЗ-OLD", "Старая позиция", "С1", "шт", 99]
    ]), "Реестр");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Итоговая заявка"],
      [],
      [],
      [],
      [],
      ["№", "Очередь заказа", "Заказать до", "Окно потребности", "Статус объёма", "Вид закупки", "Материал", "Марка / тип / размер", "Спецификация / ГОСТ", "Ед.", "К заказу", "Масса нетто, кг", "Заявка(и)", "GPR / фронт", "Исходные строки", "Статус спецификации", "Сверка объёма", "Комментарий снабжению"],
      [1, "Длинный цикл / предзаказ", "04.09.2026", "Изготовление до 30.10; монтаж Н9–10", "Подтверждено", "Металлоконструкции", "Балка", "Б1", "ГОСТ 26020-83", "шт", 1, 100, "МЗ-06", "G06", "12", "Подтверждено", "OK", "В заказ"],
      [2, "Длинный цикл / предзаказ", "04.09.2026", "Изготовление до 30.10; монтаж Н9–10", "Подтверждено", "Металлоконструкции", "Балка", "Б2", "ГОСТ 26020-83", "шт", 10, 1000, "МЗ-06", "G06", "13", "Подтверждено", "OK", "В заказ"],
      [3, "Длинный цикл / предзаказ", "04.09.2026", "Изготовление до 30.10; монтаж Н9–10", "Требует уточнения", "Металлоконструкции", "Балка", "Б3", "По РД", "шт", "", "", "МЗ-06", "G06", "14", "HOLD/RFI", "Проверить", "Уточнить объём"]
    ]), "заявки_итог");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Календарный график"],
      ["Код", "Раздел", "Этап", "M1", "M2"],
      [1, "Металлоконструкции", "Монтаж", 1000, 0]
    ]), "График");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const analysis = analyzeProjectWorkbookBuffer(buffer, "troitsk-final.xlsx", "project", { startsAt: "2026-09-01" });
    const preview = parseProjectWorkbookBuffer(buffer, "troitsk-final.xlsx", "project", { startsAt: "2026-09-01" });

    expect(analysis.errors).toEqual([]);
    expect(analysis.summary.materials).toBe(3);
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "заявки_итог")).toMatchObject({ role: "materials", included: true });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "Реестр")).toMatchObject({ role: "materials", included: false });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "Реестр")?.reason).toContain("итогового листа");
    expect(preview.materials).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringContaining("[МЗ-06] Балка · Б1"), unit: "шт", requiredQty: 1, orderByAt: "2026-09-04", neededAt: "2026-10-30" }),
      expect.objectContaining({ name: expect.stringContaining("[МЗ-06] Балка · Б2"), unit: "шт", requiredQty: 10, orderByAt: "2026-09-04", neededAt: "2026-10-30" }),
      expect.objectContaining({ name: expect.stringContaining("[МЗ-06] Балка · Б3"), unit: "шт", requiredQty: 0, orderByAt: "2026-09-04", neededAt: "2026-10-30" })
    ]));
    expect(preview.materials.some((item) => item.name.includes("Старая позиция"))).toBe(false);
  });

  it("recalculates the workbook from confirmed sheet roles and exclusions", () => {
    const analysis = analyzeProjectWorkbookBuffer(workbookBuffer(), "project.xlsx", "preview", {
      startsAt: "2026-07-01",
      sheetOverrides: {
        "01_ССР_КП": { enabled: false },
        "05_Материалы": { enabled: false },
        "23_ИТР_ФОТ": { role: "reference" }
      }
    });

    expect(analysis.errors).toEqual([]);
    expect(analysis.summary).toMatchObject({
      excludedSheets: 2,
      overriddenSheets: 3,
      materials: 0,
      payrollItems: 0,
      sourceDirectCost: undefined,
      reconciliationGap: 0,
      estimatedDirectCost: 1200
    });
    expect(analysis.quality).toMatchObject({
      status: "ready",
      acknowledgementRequired: false,
      metrics: { sourceDirectCost: undefined, blockers: 0, warnings: 0 }
    });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "05_Материалы")).toMatchObject({
      detectedRole: "materials",
      role: "materials",
      enabled: false,
      overridden: true,
      included: false
    });
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "23_ИТР_ФОТ")).toMatchObject({
      detectedRole: "payroll",
      role: "reference",
      enabled: true,
      overridden: true,
      included: false
    });
  });

  it("validates the serialized sheet mapping contract", () => {
    expect(parseProjectWorkbookSheetOverrides(JSON.stringify({ Sheet1: { role: "works", enabled: true } }))).toEqual({
      Sheet1: { role: "works", enabled: true }
    });
    expect(() => parseProjectWorkbookSheetOverrides(JSON.stringify({ Sheet1: { role: "database" } }))).toThrow("Недопустимая роль");
    expect(() => parseProjectWorkbookSheetOverrides("not-json")).toThrow("некорректный JSON");
  });
});
