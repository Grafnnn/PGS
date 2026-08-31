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

export type ExpenseCategoryOption = {
  value: string;
  label: string;
  custom: boolean;
};

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

export const builtInExpenseCategoryOptions: ExpenseCategoryOption[] = expenseCategories.map((value) => ({
  value,
  label: expenseCategoryLabels[value],
  custom: false
}));

const customCategoryPrefix = "custom:";

export function customExpenseCategoryValue(id: string) {
  return `${customCategoryPrefix}${id}`;
}

export function customExpenseCategoryId(value: string) {
  if (!value.startsWith(customCategoryPrefix)) return null;
  const id = value.slice(customCategoryPrefix.length);
  return id && id.length <= 200 ? id : null;
}

export function isExpenseCategoryValue(value: string) {
  return expenseCategories.includes(value as ExpenseCategory) || customExpenseCategoryId(value) !== null;
}

export function expenseCategoryLabel(value: string, customLabels: Record<string, string> = {}) {
  return expenseCategoryLabels[value as ExpenseCategory] ?? customLabels[value] ?? "Статья не найдена";
}

export function customExpenseCategoryOption(category: { id: string; name: string }): ExpenseCategoryOption {
  return { value: customExpenseCategoryValue(category.id), label: category.name, custom: true };
}

export function normalizeExpenseCategoryName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

export const expensePaymentMethods = ["cash", "card", "bank", "advance", "unknown"] as const;
export type ExpensePaymentMethod = (typeof expensePaymentMethods)[number];

export const expensePaymentMethodLabels: Record<ExpensePaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  bank: "Безналичный расчёт",
  advance: "Подотчёт",
  unknown: "Не указан"
};
