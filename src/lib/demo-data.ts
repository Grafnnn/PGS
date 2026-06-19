import type { DemoState } from "./types";

const today = new Date("2026-06-19T12:00:00+03:00");
const isoShift = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);

export const demoState: DemoState = {
  users: [
    {
      id: "user-demo",
      name: "Алексей Орлов",
      email: "demo@pgs.local",
      role: "owner"
    }
  ],
  projects: [
    {
      id: "project-demo",
      organizationId: "org-demo",
      name: "Демо объект - строительство административного здания",
      customer: "АО Городская инфраструктура",
      object: "Административное здание",
      address: "Москва, ул. Производственная, 12",
      contractAmount: 50_000_000,
      vatMode: "vat",
      startsAt: isoShift(-10),
      endsAt: isoShift(90),
      manager: "Ирина Соколова",
      status: "active"
    }
  ],
  budgetItems: [
    {
      id: "b-earth-1",
      projectId: "project-demo",
      section: "Земляные работы",
      code: "1.1",
      name: "Разработка котлована",
      unit: "м3",
      qty: 2400,
      plannedUnitPrice: 620,
      actualUnitPrice: 690,
      forecastUnitPrice: 700,
      kind: "work",
      source: "ВОР заказчика"
    },
    {
      id: "b-mono-1",
      projectId: "project-demo",
      section: "Монолитные работы",
      code: "2.1",
      name: "Бетон В25",
      unit: "м3",
      qty: 1250,
      plannedUnitPrice: 6100,
      actualUnitPrice: 6550,
      forecastUnitPrice: 6700,
      kind: "material",
      source: "КП поставщиков"
    },
    {
      id: "b-mono-2",
      projectId: "project-demo",
      section: "Монолитные работы",
      code: "2.2",
      name: "Арматура А500С",
      unit: "т",
      qty: 180,
      plannedUnitPrice: 72_000,
      actualUnitPrice: 78_000,
      forecastUnitPrice: 80_000,
      kind: "material",
      source: "Смета"
    },
    {
      id: "b-net-1",
      projectId: "project-demo",
      section: "Наружные сети",
      code: "3.1",
      name: "Монтаж трубы ПНД",
      unit: "п.м.",
      qty: 900,
      plannedUnitPrice: 1850,
      actualUnitPrice: 1900,
      forecastUnitPrice: 1980,
      kind: "work",
      source: "ВОР заказчика"
    },
    {
      id: "b-roof-1",
      projectId: "project-demo",
      section: "Кровля",
      code: "4.1",
      name: "Гидроизоляция кровли",
      unit: "м2",
      qty: 1600,
      plannedUnitPrice: 1450,
      actualUnitPrice: 1440,
      forecastUnitPrice: 1500,
      kind: "subcontract",
      source: "Договор субподряда"
    },
    {
      id: "b-fin-1",
      projectId: "project-demo",
      section: "Накладные расходы",
      code: "6.1",
      name: "Управление проектом и стройплощадкой",
      unit: "мес",
      qty: 4,
      plannedUnitPrice: 1_250_000,
      actualUnitPrice: 1_310_000,
      forecastUnitPrice: 1_350_000,
      kind: "overhead",
      source: "Управленческий бюджет"
    }
  ],
  scheduleItems: [
    {
      id: "s-earth",
      projectId: "project-demo",
      budgetItemId: "b-earth-1",
      name: "Завершить котлован",
      owner: "Прораб",
      startsAt: isoShift(-10),
      endsAt: isoShift(-2),
      plannedQty: 2400,
      actualQty: 2050,
      status: "delayed"
    },
    {
      id: "s-base",
      projectId: "project-demo",
      name: "Подготовка основания",
      owner: "ПТО",
      startsAt: isoShift(-1),
      endsAt: isoShift(6),
      plannedQty: 100,
      actualQty: 20,
      status: "in_progress",
      dependency: "s-earth"
    },
    {
      id: "s-mono",
      projectId: "project-demo",
      budgetItemId: "b-mono-1",
      name: "Монолит первого этажа",
      owner: "РП",
      startsAt: isoShift(5),
      endsAt: isoShift(28),
      plannedQty: 1250,
      actualQty: 0,
      status: "not_started"
    },
    {
      id: "s-net",
      projectId: "project-demo",
      budgetItemId: "b-net-1",
      name: "Наружные сети",
      owner: "Техдиректор",
      startsAt: isoShift(15),
      endsAt: isoShift(36),
      plannedQty: 900,
      actualQty: 0,
      status: "not_started"
    },
    {
      id: "s-roof",
      projectId: "project-demo",
      budgetItemId: "b-roof-1",
      name: "Кровельный контур",
      owner: "Субподрядчик",
      startsAt: isoShift(55),
      endsAt: isoShift(74),
      plannedQty: 1600,
      actualQty: 0,
      status: "not_started"
    }
  ],
  materials: [
    {
      id: "m-concrete",
      projectId: "project-demo",
      name: "Бетон В25",
      unit: "м3",
      requiredQty: 1250,
      orderedQty: 800,
      deliveredQty: 120,
      consumedQty: 80,
      plannedUnitPrice: 6100,
      actualUnitPrice: 6550,
      supplier: "БетонТорг",
      neededAt: isoShift(5),
      status: "ordered"
    },
    {
      id: "m-rebar",
      projectId: "project-demo",
      name: "Арматура А500С",
      unit: "т",
      requiredQty: 180,
      orderedQty: 120,
      deliveredQty: 40,
      consumedQty: 12,
      plannedUnitPrice: 72_000,
      actualUnitPrice: 78_000,
      supplier: "МеталлКомплект",
      neededAt: isoShift(3),
      status: "in_transit"
    },
    {
      id: "m-sand",
      projectId: "project-demo",
      name: "Песок",
      unit: "т",
      requiredQty: 650,
      orderedQty: 650,
      deliveredQty: 650,
      consumedQty: 520,
      plannedUnitPrice: 950,
      actualUnitPrice: 980,
      supplier: "Карьер Север",
      neededAt: isoShift(-4),
      status: "delivered"
    },
    {
      id: "m-pipe",
      projectId: "project-demo",
      name: "Труба ПНД",
      unit: "п.м.",
      requiredQty: 900,
      orderedQty: 0,
      deliveredQty: 0,
      consumedQty: 0,
      plannedUnitPrice: 690,
      actualUnitPrice: 0,
      supplier: "Не выбран",
      neededAt: isoShift(12),
      status: "required"
    }
  ],
  procurementRequests: [
    {
      id: "pr-1",
      projectId: "project-demo",
      title: "Дозаказ арматуры и бетона на первый этаж",
      initiator: "Прораб",
      neededAt: isoShift(4),
      priority: "critical",
      status: "submitted",
      items: [
        { materialId: "m-concrete", name: "Бетон В25", qty: 450, unit: "м3", comment: "Поставка под заливку захватки 1" },
        { materialId: "m-rebar", name: "Арматура А500С", qty: 60, unit: "т", comment: "Закрыть дефицит по каркасу" }
      ]
    }
  ],
  payments: [
    {
      id: "pay-in-1",
      projectId: "project-demo",
      title: "Аванс заказчика",
      counterparty: "АО Городская инфраструктура",
      direction: "incoming",
      plannedAt: isoShift(-7),
      paidAt: isoShift(-6),
      amount: 8_000_000,
      status: "paid",
      category: "customer"
    },
    {
      id: "pay-out-1",
      projectId: "project-demo",
      title: "Оплата бетона",
      counterparty: "БетонТорг",
      direction: "outgoing",
      plannedAt: isoShift(2),
      amount: 5_240_000,
      status: "approved",
      category: "supplier"
    },
    {
      id: "pay-out-2",
      projectId: "project-demo",
      title: "Аванс за арматуру",
      counterparty: "МеталлКомплект",
      direction: "outgoing",
      plannedAt: isoShift(1),
      amount: 9_360_000,
      status: "approved",
      category: "supplier"
    },
    {
      id: "pay-out-3",
      projectId: "project-demo",
      title: "ФОТ стройплощадки",
      counterparty: "Производственный персонал",
      direction: "outgoing",
      plannedAt: isoShift(8),
      amount: 1_600_000,
      status: "planned",
      category: "payroll"
    }
  ],
  dailyReports: [
    {
      id: "dr-1",
      projectId: "project-demo",
      date: isoShift(-1),
      author: "Мастер участка",
      weather: "Облачно, +18, без осадков",
      workers: 26,
      engineers: 3,
      equipment: "Экскаватор 1, самосвалы 4, виброплита 2",
      completedWorks: "Вывоз грунта 280 м3, подготовка основания 20%",
      materialsReceived: "Песок 120 т",
      materialsConsumed: "Песок 95 т, щебень 40 т",
      downtime: "2 часа ожидание самосвалов",
      issues: "Не закрыт объем по котловану, требуется ускорить вывоз грунта.",
      status: "submitted"
    }
  ],
  risks: [
    {
      id: "risk-1",
      projectId: "project-demo",
      title: "Котлован отстает от графика",
      reason: "Факт 2050 м3 из 2400 м3, окончание было запланировано два дня назад.",
      priority: "high",
      owner: "Руководитель проекта",
      dueAt: isoShift(2),
      status: "open"
    },
    {
      id: "risk-2",
      projectId: "project-demo",
      title: "Дефицит арматуры к старту монолита",
      reason: "Поставка в пути, заказано меньше проектной потребности.",
      priority: "critical",
      owner: "Снабжение",
      dueAt: isoShift(3),
      status: "in_progress"
    }
  ],
  aiMessages: []
};

export const getProjectBundle = (projectId: string) => ({
  project: demoState.projects.find((project) => project.id === projectId) ?? demoState.projects[0],
  budgetItems: demoState.budgetItems.filter((item) => item.projectId === projectId),
  scheduleItems: demoState.scheduleItems.filter((item) => item.projectId === projectId),
  materials: demoState.materials.filter((item) => item.projectId === projectId),
  procurementRequests: demoState.procurementRequests.filter((item) => item.projectId === projectId),
  payments: demoState.payments.filter((item) => item.projectId === projectId),
  dailyReports: demoState.dailyReports.filter((item) => item.projectId === projectId),
  risks: demoState.risks.filter((item) => item.projectId === projectId),
  aiMessages: demoState.aiMessages.filter((item) => item.projectId === projectId)
});
