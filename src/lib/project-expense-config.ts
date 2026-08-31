export const expenseCategories = [
  "materials",
  "labor",
  "equipment",
  "transport",
  "subcontract",
  "travel",
  "overhead",
  "tax",
  "services",
  "other"
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  materials: "Материалы",
  labor: "Оплата труда",
  equipment: "Техника и оборудование",
  transport: "Транспорт и доставка",
  subcontract: "Субподряд",
  travel: "Командировки",
  overhead: "Накладные расходы",
  tax: "Налоги и сборы",
  services: "Услуги",
  other: "Прочее"
};

export const expensePaymentMethods = ["cash", "card", "bank", "advance", "unknown"] as const;
export type ExpensePaymentMethod = (typeof expensePaymentMethods)[number];

export const expensePaymentMethodLabels: Record<ExpensePaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  bank: "Безналичный расчёт",
  advance: "Подотчёт",
  unknown: "Не указан"
};
