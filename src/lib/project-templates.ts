export type ProjectTemplateId =
  | "general_construction"
  | "engineering_networks"
  | "fit_out"
  | "roofing"
  | "concrete"
  | "facade"
  | "tender"
  | "empty";

export type TemplateModuleId = "vor" | "documents" | "schedule" | "materials" | "acceptance" | "risks" | "contract" | "reports";
export type TemplateReadinessStatus = "no_data" | "needs_import" | "needs_documents" | "needs_contract" | "ready_for_setup";

export type ProjectTemplate = {
  id: ProjectTemplateId;
  title: string;
  shortTitle: string;
  description: string;
  category: string;
  recommendedFor: string[];
  modules: TemplateModuleId[];
  documentChecklist: string[];
  procurementCategories: string[];
  scheduleStages: string[];
  riskCategories: string[];
  acceptanceRequirements: string[];
  contractTenderChecklist: string[];
  onboardingSteps: string[];
  missingDataPrompts: string[];
  firstActions: string[];
  applicabilityNotes: string[];
};

export type ProjectBaseline = {
  templateId: ProjectTemplateId;
  templateTitle: string;
  modulesEnabled: TemplateModuleId[];
  readiness: TemplateReadinessStatus;
  documentBaseline: string[];
  procurementBaseline: string[];
  scheduleBaseline: string[];
  riskBaseline: string[];
  acceptanceBaseline: string[];
  contractTenderBaseline: string[];
  onboardingPlan: string[];
  expectedMissingData: string[];
  firstActions: string[];
  warnings: string[];
  limitations: string[];
};

const commonDocuments = ["Договор/проект договора", "ВОР или смета", "Техническое задание", "График производства работ", "Требования к исполнительной документации"];
const commonRisks = ["неполный ВОР", "неподтвержденные объемы", "срыв сроков поставки", "неясные условия приемки", "кассовый разрыв"];
const commonAcceptance = ["правило подтверждения объемов", "состав пакета КС", "ответственный за исполнительную документацию"];
const commonContract = ["предмет и границы работ", "сроки и этапность", "условия оплаты", "приемка и замечания", "изменение объемов"];

const templates: ProjectTemplate[] = [
  {
    id: "general_construction",
    title: "Общестрой",
    shortTitle: "Общестрой",
    description: "Базовый строительный объект с ВОР, графиком, материалами, документами, КС и рисками.",
    category: "execution",
    recommendedFor: ["административные здания", "коммерческие объекты", "комплексные подрядные работы"],
    modules: ["vor", "documents", "schedule", "materials", "acceptance", "risks", "contract", "reports"],
    documentChecklist: [...commonDocuments, "Проектная документация", "ППР", "Журналы работ"],
    procurementCategories: ["бетон/растворы", "арматура/металл", "общестроительные материалы", "расходники", "техника"],
    scheduleStages: ["мобилизация", "подготовительные работы", "основные строительно-монтажные работы", "исполнительная документация", "сдача этапов"],
    riskCategories: [...commonRisks, "несогласованные проектные изменения"],
    acceptanceRequirements: [...commonAcceptance, "разбивка работ на предъявляемые этапы"],
    contractTenderChecklist: [...commonContract, "штрафы/пени", "обеспечения и удержания"],
    onboardingSteps: ["уточнить границы работ", "загрузить ВОР", "собрать стартовый документальный пакет", "сформировать график", "выделить материалы и первые заявки"],
    missingDataPrompts: ["подтвержденный ВОР", "условия оплаты", "требования к КС", "ответственные по разделам"],
    firstActions: ["Импортировать ВОР", "Проверить договорные условия", "Собрать чеклист документов", "Создать draft графика", "Подготовить список материалов"],
    applicabilityNotes: ["Универсальный шаблон. Не доказывает наличие документов или фактических объемов."]
  },
  {
    id: "engineering_networks",
    title: "Инженерные сети",
    shortTitle: "Сети",
    description: "Сети, коммуникации, наружные/внутренние инженерные разделы с акцентом на трассы, материалы и исполнительную.",
    category: "execution",
    recommendedFor: ["наружные сети", "внутренние инженерные системы", "кабельные/трубные трассы"],
    modules: ["vor", "documents", "schedule", "materials", "acceptance", "risks", "contract"],
    documentChecklist: [...commonDocuments, "Схемы трасс", "Акты скрытых работ", "Исполнительные схемы", "Паспорта материалов"],
    procurementCategories: ["трубы/фитинги", "кабель", "лотки/крепеж", "колодцы/арматура", "изоляция"],
    scheduleStages: ["разбивка трасс", "земляные/штробные работы", "монтаж трасс", "испытания", "исполнительные схемы"],
    riskCategories: [...commonRisks, "коллизии трасс", "нет паспортов/сертификатов", "непринятые скрытые работы"],
    acceptanceRequirements: [...commonAcceptance, "акты скрытых работ", "протоколы испытаний"],
    contractTenderChecklist: [...commonContract, "границы подключения", "требования к испытаниям"],
    onboardingSteps: ["выделить трассы/участки", "загрузить спецификацию", "проверить требования к испытаниям", "собрать паспорта материалов"],
    missingDataPrompts: ["трассы и узлы", "схемы испытаний", "перечень сертификатов", "границы ответственности"],
    firstActions: ["Разобрать спецификацию", "Собрать акты скрытых работ", "Подготовить procurement по трубам/кабелю", "Проверить условия испытаний"],
    applicabilityNotes: ["Подходит для инженерных сетей; не заменяет проектные схемы и исполнительные измерения."]
  },
  {
    id: "fit_out",
    title: "Отделочные работы",
    shortTitle: "Отделка",
    description: "Отделочные работы с фокусом на помещения, ведомость отделки, материалы и поэтапную приемку.",
    category: "execution",
    recommendedFor: ["fit-out", "ремонт", "чистовая/черновая отделка"],
    modules: ["vor", "documents", "schedule", "materials", "acceptance", "risks", "reports"],
    documentChecklist: [...commonDocuments, "Ведомость отделки", "Дизайн/рабочие чертежи", "Образцы и согласования"],
    procurementCategories: ["сухие смеси", "ЛКМ", "плитка/покрытия", "потолочные системы", "двери/фурнитура"],
    scheduleStages: ["подготовка помещений", "черновая отделка", "инженерная увязка", "чистовая отделка", "устранение замечаний"],
    riskCategories: [...commonRisks, "несогласованные материалы", "переделки из-за замечаний", "зависимость от смежников"],
    acceptanceRequirements: [...commonAcceptance, "покомнатная приемка", "реестр замечаний"],
    contractTenderChecklist: [...commonContract, "требования к образцам", "порядок устранения замечаний"],
    onboardingSteps: ["собрать ведомость помещений", "зафиксировать материалы/образцы", "разбить график по зонам", "подготовить реестр замечаний"],
    missingDataPrompts: ["ведомость помещений", "согласованные материалы", "порядок приемки", "план поставок"],
    firstActions: ["Разбить ВОР по зонам", "Проверить материалы на согласование", "Создать график по помещениям", "Подготовить checklist замечаний"],
    applicabilityNotes: ["Не подтверждает фактическое состояние помещений без рапортов и фотофиксации."]
  },
  {
    id: "roofing",
    title: "Кровля",
    shortTitle: "Кровля",
    description: "Кровельные работы с упором на слои пирога, погодные ограничения, материалы и акты скрытых работ.",
    category: "specialty",
    recommendedFor: ["мембранная кровля", "наплавляемая кровля", "ремонт кровли"],
    modules: ["vor", "documents", "schedule", "materials", "acceptance", "risks", "contract"],
    documentChecklist: [...commonDocuments, "Пирог кровли", "Акты скрытых работ", "Паспорта гидроизоляции", "Журнал погодных условий"],
    procurementCategories: ["гидроизоляция", "утеплитель", "пароизоляция", "воронки/доборы", "крепеж"],
    scheduleStages: ["подготовка основания", "пароизоляция", "утепление", "гидроизоляция", "узлы и примыкания", "испытания/приемка"],
    riskCategories: [...commonRisks, "погодные окна", "скрытые дефекты основания", "протечки после сдачи"],
    acceptanceRequirements: [...commonAcceptance, "акты скрытых слоев", "проверка примыканий"],
    contractTenderChecklist: [...commonContract, "гарантии", "погодные ограничения"],
    onboardingSteps: ["проверить пирог кровли", "выделить слои в ВОР", "собрать паспорта материалов", "запланировать акты скрытых работ"],
    missingDataPrompts: ["пирог кровли", "площадь и узлы", "погодные ограничения", "гарантийные условия"],
    firstActions: ["Проверить кровельный пирог", "Разбить график по слоям", "Собрать материалы и паспорта", "Подготовить акты скрытых работ"],
    applicabilityNotes: ["Рекомендации не заменяют обследование основания и проектные решения."]
  },
  {
    id: "concrete",
    title: "Монолит",
    shortTitle: "Монолит",
    description: "Монолитные работы с контролем бетона, арматуры, опалубки, захваток и исполнительной документации.",
    category: "specialty",
    recommendedFor: ["каркас", "фундаменты", "монолитные конструкции"],
    modules: ["vor", "documents", "schedule", "materials", "acceptance", "risks", "reports"],
    documentChecklist: [...commonDocuments, "Арматурные чертежи", "Акты армирования", "Паспорта бетона", "Журнал бетонных работ"],
    procurementCategories: ["бетон", "арматура", "опалубка", "закладные", "добавки"],
    scheduleStages: ["армирование", "опалубка", "бетонирование", "выдерживание/распалубка", "исполнительная"],
    riskCategories: [...commonRisks, "срыв поставки бетона", "несоответствие армирования", "нет лабораторных документов"],
    acceptanceRequirements: [...commonAcceptance, "акты армирования", "журнал бетонных работ"],
    contractTenderChecklist: [...commonContract, "требования к лабораторному контролю", "границы ответственности по опалубке"],
    onboardingSteps: ["разбить работы по захваткам", "проверить арматуру и бетон", "настроить акты до бетонирования", "подготовить график поставок"],
    missingDataPrompts: ["захватки", "марки бетона", "ведомость арматуры", "лабораторные требования"],
    firstActions: ["Разбить ВОР по захваткам", "Собрать потребность бетона/арматуры", "Подготовить акты армирования", "Проверить график бетонирования"],
    applicabilityNotes: ["Baseline не подтверждает фактическое качество бетона или армирования."]
  },
  {
    id: "facade",
    title: "Фасад",
    shortTitle: "Фасад",
    description: "Фасадные работы с акцентом на подконструкцию, облицовку, высотные работы и согласование узлов.",
    category: "specialty",
    recommendedFor: ["вентилируемый фасад", "мокрый фасад", "облицовка"],
    modules: ["vor", "documents", "schedule", "materials", "acceptance", "risks", "contract"],
    documentChecklist: [...commonDocuments, "Фасадные узлы", "Раскладка/карты", "Паспорта системы", "Акты скрытых работ"],
    procurementCategories: ["подконструкция", "утеплитель", "облицовка", "крепеж", "герметики"],
    scheduleStages: ["геодезия/разметка", "кронштейны", "утепление", "облицовка", "примыкания", "приемка фасада"],
    riskCategories: [...commonRisks, "неутвержденные узлы", "высотные ограничения", "срыв поставки облицовки"],
    acceptanceRequirements: [...commonAcceptance, "акты скрытой подконструкции", "реестр замечаний по фасаду"],
    contractTenderChecklist: [...commonContract, "система фасада", "гарантии и требования производителя"],
    onboardingSteps: ["уточнить фасадную систему", "собрать карты/узлы", "выделить материалы долгой поставки", "проверить акты скрытых работ"],
    missingDataPrompts: ["узлы фасада", "карты раскладки", "система крепления", "сроки поставки облицовки"],
    firstActions: ["Проверить фасадные узлы", "Выделить long-lead материалы", "Подготовить график по захваткам", "Собрать паспорта системы"],
    applicabilityNotes: ["Не заменяет согласование фасадной системы и геодезический контроль."]
  },
  {
    id: "tender",
    title: "Тендерный проект",
    shortTitle: "Тендер",
    description: "Предконтрактный анализ ТЗ, договора, ВОР, цены, рисков и условий участия.",
    category: "precontract",
    recommendedFor: ["тендеры", "КП", "оценка договора до подписания"],
    modules: ["vor", "documents", "risks", "contract", "reports"],
    documentChecklist: ["ТЗ", "Проект договора", "ВОР/смета", "Тендерная документация", "Разъяснения заказчика", "КП/ценовое предложение"],
    procurementCategories: ["критичные материалы", "long-lead позиции", "ценовые запросы поставщикам"],
    scheduleStages: ["разбор ТЗ", "проверка ВОР", "оценка цены", "risk review", "решение об участии"],
    riskCategories: ["неполное ТЗ", "жесткие штрафы", "неясная приемка", "невыгодная оплата", "неподтвержденные объемы"],
    acceptanceRequirements: ["условия приемки", "порядок закрытия КС", "обязательные приложения"],
    contractTenderChecklist: ["предмет и scope", "цена и НДС", "аванс/платежи", "штрафы", "обеспечения", "изменение объемов", "сроки подписания"],
    onboardingSteps: ["загрузить ТЗ/договор/ВОР", "проверить риски договора", "выделить спорные объемы", "подготовить вопросы заказчику"],
    missingDataPrompts: ["исходный договор", "ТЗ", "полный ВОР", "условия оплаты", "сроки и штрафы"],
    firstActions: ["Проверить договор", "Разобрать ВОР", "Сформировать вопросы заказчику", "Оценить маржинальность и cashflow", "Подготовить go/no-go"],
    applicabilityNotes: ["Шаблон не является юридическим заключением и не выдумывает условия договора."]
  },
  {
    id: "empty",
    title: "Пустой проект",
    shortTitle: "Manual",
    description: "Минимальный проект без преднастроенного baseline. Подходит для ручной настройки.",
    category: "manual",
    recommendedFor: ["нестандартные проекты", "ручной ввод", "технические проверки"],
    modules: [],
    documentChecklist: [],
    procurementCategories: [],
    scheduleStages: [],
    riskCategories: [],
    acceptanceRequirements: [],
    contractTenderChecklist: [],
    onboardingSteps: ["выбрать рабочие модули вручную", "загрузить исходные данные", "настроить документы, график и КС по факту"],
    missingDataPrompts: ["тип проекта", "ВОР", "документы", "график", "условия договора"],
    firstActions: ["Выбрать модули", "Добавить описание проекта", "Загрузить ВОР или документы"],
    applicabilityNotes: ["Система не будет делать выводы по типу работ без исходных данных."]
  }
];

const templateIds = new Set<ProjectTemplateId>(templates.map((template) => template.id));

function cloneTemplate(template: ProjectTemplate): ProjectTemplate {
  return {
    ...template,
    recommendedFor: [...template.recommendedFor],
    modules: [...template.modules],
    documentChecklist: [...template.documentChecklist],
    procurementCategories: [...template.procurementCategories],
    scheduleStages: [...template.scheduleStages],
    riskCategories: [...template.riskCategories],
    acceptanceRequirements: [...template.acceptanceRequirements],
    contractTenderChecklist: [...template.contractTenderChecklist],
    onboardingSteps: [...template.onboardingSteps],
    missingDataPrompts: [...template.missingDataPrompts],
    firstActions: [...template.firstActions],
    applicabilityNotes: [...template.applicabilityNotes]
  };
}

export function getProjectTemplates(): ProjectTemplate[] {
  return templates.map(cloneTemplate);
}

export function validateProjectTemplateSelection(value: unknown): ProjectTemplateId {
  return typeof value === "string" && templateIds.has(value as ProjectTemplateId) ? (value as ProjectTemplateId) : "general_construction";
}

export function getProjectTemplateById(id: unknown): ProjectTemplate {
  const normalized = validateProjectTemplateSelection(id);
  return cloneTemplate(templates.find((template) => template.id === normalized) ?? templates[0]);
}

function readinessForTemplate(template: ProjectTemplate): TemplateReadinessStatus {
  if (template.id === "empty") return "no_data";
  if (template.id === "tender") return "needs_contract";
  if (template.documentChecklist.length && template.modules.includes("documents")) return "needs_documents";
  if (template.modules.includes("vor")) return "needs_import";
  return "ready_for_setup";
}

export function buildTemplateDocumentChecklist(templateId: unknown) {
  return getProjectTemplateById(templateId).documentChecklist;
}

export function buildTemplateProcurementBaseline(templateId: unknown) {
  return getProjectTemplateById(templateId).procurementCategories;
}

export function buildTemplateScheduleBaseline(templateId: unknown) {
  return getProjectTemplateById(templateId).scheduleStages;
}

export function buildTemplateRiskBaseline(templateId: unknown) {
  return getProjectTemplateById(templateId).riskCategories;
}

export function buildTemplateAcceptanceBaseline(templateId: unknown) {
  return getProjectTemplateById(templateId).acceptanceRequirements;
}

export function buildTemplateContractTenderBaseline(templateId: unknown) {
  return getProjectTemplateById(templateId).contractTenderChecklist;
}

export function buildOnboardingPlanFromTemplate(templateId: unknown): string[] {
  return getProjectTemplateById(templateId).onboardingSteps;
}

export function buildProjectBaselineFromTemplate(templateId: unknown): ProjectBaseline {
  const template = getProjectTemplateById(templateId);
  return {
    templateId: template.id,
    templateTitle: template.title,
    modulesEnabled: [...template.modules],
    readiness: readinessForTemplate(template),
    documentBaseline: [...template.documentChecklist],
    procurementBaseline: [...template.procurementCategories],
    scheduleBaseline: [...template.scheduleStages],
    riskBaseline: [...template.riskCategories],
    acceptanceBaseline: [...template.acceptanceRequirements],
    contractTenderBaseline: [...template.contractTenderChecklist],
    onboardingPlan: [...template.onboardingSteps],
    expectedMissingData: [...template.missingDataPrompts],
    firstActions: [...template.firstActions],
    warnings: template.id === "empty" ? ["Шаблон не задает рабочий baseline; настройка полностью ручная."] : [],
    limitations: [
      ...template.applicabilityNotes,
      "Baseline является рекомендацией по настройке, а не подтверждением выполненных работ, документов, оплат или договорных условий.",
      "Система не выдумывает даты, платежные условия, загруженные файлы или фактические объемы."
    ]
  };
}

export function inferProjectTemplateId(input: { object?: string | null; name?: string | null; description?: string | null } | null | undefined): ProjectTemplateId | null {
  const text = `${input?.object ?? ""} ${input?.name ?? ""} ${input?.description ?? ""}`.toLocaleLowerCase("ru-RU");
  if (!text.trim()) return null;
  if (/тендер|кп|конкурс|предконтракт/.test(text)) return "tender";
  if (/сети|инженер|кабель|труб|пнд|водоснаб|канализац|электр/.test(text)) return "engineering_networks";
  if (/отдел|fit.?out|ремонт|помещен|плитк|потол/.test(text)) return "fit_out";
  if (/кровл|гидроизоляц|мембран/.test(text)) return "roofing";
  if (/монолит|бетон|арматур|каркас|фундамент/.test(text)) return "concrete";
  if (/фасад|облицов|витраж|подконструкц/.test(text)) return "facade";
  return "general_construction";
}
