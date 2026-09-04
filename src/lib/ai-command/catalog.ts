import type { AiScenario } from "./types";

export type AiLifecycleStage = "overview" | "start" | "plan" | "delivery" | "commercial" | "closeout";

export type AiScenarioConfig = {
  scenario: AiScenario;
  title: string;
  shortTitle: string;
  description: string;
  outcome: string;
  data: string[];
  dataKeys: string[];
  target: string;
  stage: AiLifecycleStage;
};

export const aiLifecycleStages: Array<{ id: AiLifecycleStage; label: string; description: string }> = [
  { id: "overview", label: "Сводка", description: "Общее состояние и решения руководителя" },
  { id: "start", label: "Старт", description: "Исходные данные, договор и бюджет" },
  { id: "plan", label: "План", description: "Сроки, ресурсы, снабжение и деньги" },
  { id: "delivery", label: "Исполнение", description: "Площадка, рапорты, качество и согласования" },
  { id: "commercial", label: "Коммерция", description: "Риски, изменения, претензии и КС" },
  { id: "closeout", label: "Закрытие", description: "Документы, сдача и деловая коммуникация" }
];

export const aiScenarioCatalog: AiScenarioConfig[] = [
  { scenario: "summary", title: "Сводка по проекту", shortTitle: "Сводка", description: "Связывает сроки, деньги, снабжение, качество и обязательства.", outcome: "Приоритеты и действия на ближайшие 7 дней", data: ["Проект", "ВОР", "График", "Финансы", "Риски"], dataKeys: ["project", "budget", "schedule", "materials", "procurement", "finance", "risks", "dailyReports", "expenses", "workforce", "quality", "commercial", "acceptance", "controls"], target: "Действия", stage: "overview" },
  { scenario: "executive-report", title: "Отчет руководителю", shortTitle: "Отчет", description: "Готовит короткую объяснимую записку без изменения данных.", outcome: "Черновик управленческого отчета", data: ["Все проверенные контуры"], dataKeys: ["project", "budget", "schedule", "materials", "finance", "risks", "dailyReports", "quality", "commercial", "acceptance", "controls"], target: "Рапорты", stage: "overview" },
  { scenario: "onboarding-review", title: "Проверить старт проекта", shortTitle: "Старт проекта", description: "Проверяет обязательные исходные данные до запуска исполнения.", outcome: "Список пробелов стартовой базы", data: ["Карточка", "ВОР", "График", "Документы"], dataKeys: ["project", "budget", "schedule", "documents", "workforce"], target: "Обзор", stage: "start" },
  { scenario: "contract-review", title: "Проверить договор", shortTitle: "Договор", description: "Выявляет незакрытые условия оплаты, приемки и изменений.", outcome: "Договорные риски и вопросы к согласованию", data: ["Договор", "ТЗ", "ВОР", "Финансы"], dataKeys: ["project", "documents", "budget", "finance", "risks", "commercial"], target: "Договор / Тендер", stage: "start" },
  { scenario: "budget-review", title: "Проверить ВОР", shortTitle: "ВОР", description: "Находит нулевые цены, объемы, дубли и крупные отклонения.", outcome: "Проверяемый список сметных ошибок", data: ["ВОР", "Разделы", "План/факт"], dataKeys: ["project", "budget", "expenses", "controls"], target: "Бюджет / ВОР", stage: "start" },
  { scenario: "schedule-review", title: "Проверить график", shortTitle: "График", description: "Связывает просрочки с ресурсами, материалами и фактом.", outcome: "План восстановления критичных работ", data: ["График", "Зависимости", "Факт"], dataKeys: ["project", "schedule", "risks", "dailyReports", "workforce", "materials", "controls"], target: "График", stage: "plan" },
  { scenario: "workforce-review", title: "Проверить ресурсы и ФОТ", shortTitle: "ФОТ и ресурсы", description: "Сопоставляет трудовую потребность, людей, нормы и стоимость.", outcome: "Дефициты людей и качества ресурсного плана", data: ["ФОТ", "Потребность", "Назначения", "Допуски"], dataKeys: ["project", "workforce", "schedule", "dailyReports", "budget"], target: "ФОТ", stage: "plan" },
  { scenario: "procurement-review", title: "Проверить снабжение", shortTitle: "Снабжение", description: "Находит дефициты, риски сроков, поставщиков и КП.", outcome: "Черновик действий снабжения", data: ["Материалы", "Заявки", "Поставщики"], dataKeys: ["project", "materials", "procurement", "schedule", "finance"], target: "Заявки", stage: "plan" },
  { scenario: "finance-review", title: "Финансовый анализ", shortTitle: "Финансы", description: "Проверяет маржу, расходы, платежи и прогноз до завершения.", outcome: "Финансовые отклонения и платежные решения", data: ["Платежи", "Расходы", "Бюджет", "EVM"], dataKeys: ["project", "budget", "finance", "expenses", "commercial", "acceptance", "controls", "risks"], target: "Финансы", stage: "plan" },
  { scenario: "field-review", title: "Проверить стройплощадку", shortTitle: "Площадка", description: "Проверяет свежесть факта, фото, простои и непривязанный прогресс.", outcome: "Операционные пробелы текущей смены", data: ["Рапорты", "Фото", "Прогресс", "Проблемы"], dataKeys: ["project", "field", "dailyReports", "schedule", "quality"], target: "Площадка", stage: "delivery" },
  { scenario: "daily-report-summary", title: "Сводка рапортов", shortTitle: "Рапорты", description: "Сводит выполненные работы, людей, простои и замечания.", outcome: "Короткая сводка факта и отклонений", data: ["Рапорты", "График", "Риски"], dataKeys: ["project", "dailyReports", "field", "schedule", "risks"], target: "Рапорты", stage: "delivery" },
  { scenario: "quality-review", title: "Проверить качество и приемку", shortTitle: "Качество", description: "Находит блокеры приемки, просроченные замечания и пустые меры.", outcome: "Очередь проверок и корректирующих действий", data: ["Инспекции", "Замечания", "Фото", "Приемка"], dataKeys: ["project", "quality", "field", "schedule", "documents"], target: "Исполнение", stage: "delivery" },
  { scenario: "rfi-review", title: "Проверить RFI и согласования", shortTitle: "RFI", description: "Выявляет просроченные вопросы и материалы без ответа.", outcome: "Приоритетный список согласований", data: ["RFI", "Submittals", "Документы"], dataKeys: ["project", "collaboration", "documents", "schedule"], target: "RFI / Согласования", stage: "delivery" },
  { scenario: "risk-review", title: "Собрать риски", shortTitle: "Риски", description: "Объединяет риски срока, денег, снабжения и качества.", outcome: "Ранжированный реестр рисков", data: ["Риски", "График", "Финансы", "Материалы"], dataKeys: ["project", "budget", "schedule", "materials", "procurement", "finance", "risks", "quality", "commercial"], target: "Риски", stage: "commercial" },
  { scenario: "claims-review", title: "Проверить изменения и претензии", shortTitle: "Изменения", description: "Проверяет неоцененные изменения, сроки и подтверждающие материалы.", outcome: "Список коммерческих требований к оформлению", data: ["Изменения", "Обязательства", "Документы"], dataKeys: ["project", "commercial", "documents", "schedule", "finance"], target: "Договор / Тендер", stage: "commercial" },
  { scenario: "acceptance-review", title: "Проверить готовность КС", shortTitle: "КС и оплата", description: "Сопоставляет факт, качество, документы и платежные приложения.", outcome: "Что можно предъявить и что блокирует оплату", data: ["Факт", "КС", "Качество", "Документы"], dataKeys: ["project", "acceptance", "quality", "schedule", "documents", "commercial", "finance"], target: "КС", stage: "commercial" },
  { scenario: "document-review", title: "Проверить документы", shortTitle: "Документы", description: "Проверяет комплектность и честно сообщает границы без OCR.", outcome: "Пробелы документального пакета", data: ["Документы", "Категории", "Версии"], dataKeys: ["project", "documents", "collaboration", "acceptance", "closeout"], target: "Документы", stage: "closeout" },
  { scenario: "closeout-review", title: "Проверить сдачу и гарантию", shortTitle: "Сдача", description: "Находит незакрытые пакеты, чек-листы и гарантийные даты.", outcome: "План сдачи и закрытия обязательств", data: ["Пакеты сдачи", "Чек-листы", "Гарантии"], dataKeys: ["project", "closeout", "quality", "documents", "acceptance"], target: "Сдача / Гарантия", stage: "closeout" },
  { scenario: "draft-text", title: "Подготовить письмо", shortTitle: "Письмо", description: "Формирует черновик по выбранному контексту без отправки.", outcome: "Редактируемый деловой текст", data: ["Контекст проекта", "Отклонения"], dataKeys: ["project", "budget", "schedule", "materials", "finance", "risks", "commercial", "collaboration"], target: "Документы", stage: "closeout" }
];

export const aiScenarioById = Object.fromEntries(aiScenarioCatalog.map((item) => [item.scenario, item])) as Record<AiScenario, AiScenarioConfig>;

export const aiScenarioForProjectTab: Partial<Record<string, AiScenario>> = {
  Обзор: "summary",
  "Бюджет / ВОР": "budget-review",
  ФОТ: "workforce-review",
  График: "schedule-review",
  Материалы: "procurement-review",
  Заявки: "procurement-review",
  Финансы: "finance-review",
  "Договор / Тендер": "contract-review",
  "КП / Подача": "contract-review",
  КС: "acceptance-review",
  "Сдача / Гарантия": "closeout-review",
  Исполнение: "quality-review",
  Площадка: "field-review",
  Рапорты: "daily-report-summary",
  Риски: "risk-review",
  Документы: "document-review",
  "RFI / Согласования": "rfi-review",
  Действия: "summary",
  Аналитика: "summary"
};
