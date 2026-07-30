export type SidebarPreference = "expanded" | "collapsed";

export const SIDEBAR_STORAGE_KEY = "pgs.sidebar.state";

export type AppNavigationGroup = "Работа" | "Настройки";

export type AppNavigationItem = {
  id: "dashboard" | "inbox" | "portfolio" | "projects" | "users" | "integrations";
  group: AppNavigationGroup;
  href: string;
  keywords: string[];
  label: string;
  match: string[];
  section: string;
};

export const APP_NAVIGATION_GROUPS: AppNavigationGroup[] = ["Работа", "Настройки"];

export const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  {
    id: "dashboard",
    group: "Работа",
    href: "/dashboard",
    keywords: ["главная", "сводка", "command center", "kpi"],
    label: "Главная",
    match: ["/dashboard"],
    section: "Сводка и приоритеты"
  },
  {
    id: "inbox",
    group: "Работа",
    href: "/inbox",
    keywords: ["согласования", "решения", "блокеры", "уведомления", "approval", "inbox"],
    label: "Согласования",
    match: ["/inbox"],
    section: "Решения и уведомления"
  },
  {
    id: "portfolio",
    group: "Работа",
    href: "/portfolio",
    keywords: ["портфель", "объекты", "сравнение", "portfolio"],
    label: "Портфель",
    match: ["/portfolio"],
    section: "Все объекты и сравнение"
  },
  {
    id: "projects",
    group: "Работа",
    href: "/projects",
    keywords: [
      "проекты",
      "вор",
      "фот",
      "график",
      "материалы",
      "снабжение",
      "закупки",
      "финансы",
      "cash-flow",
      "документы",
      "риски",
      "рапорты",
      "кс",
      "ai"
    ],
    label: "Проекты",
    match: ["/projects"],
    section: "Объекты и рабочие модули"
  },
  {
    id: "users",
    group: "Настройки",
    href: "/admin/users",
    keywords: ["пользователи", "роли", "доступ", "команда", "admin"],
    label: "Пользователи",
    match: ["/admin/users"],
    section: "Роли и доступ"
  },
  {
    id: "integrations",
    group: "Настройки",
    href: "/admin/integrations",
    keywords: ["интеграции", "подключения", "github", "render", "openai", "google"],
    label: "Интеграции",
    match: ["/admin/integrations"],
    section: "Подключения и готовность"
  }
];

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function normalizeNavigationQuery(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function filterNavigationItems(items: AppNavigationItem[], query: string) {
  const normalized = normalizeNavigationQuery(query);
  if (!normalized) return items;
  const terms = normalized.split(" ");
  return items.filter((item) => {
    const haystack = normalizeNavigationQuery(
      [item.label, item.section, item.group, ...item.keywords].join(" ")
    );
    return terms.every((term) => haystack.includes(term));
  });
}

export function isNavigationItemActive(pathname: string, item: AppNavigationItem) {
  return item.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function normalizeSidebarPreference(value: string | null): SidebarPreference | null {
  return value === "expanded" || value === "collapsed" ? value : null;
}

export function readSidebarPreference(storage?: StorageLike | null): SidebarPreference | null {
  if (!storage) return null;
  try {
    return normalizeSidebarPreference(storage.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeSidebarPreference(storage: StorageLike | undefined | null, value: SidebarPreference) {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_STORAGE_KEY, value);
  } catch {
    // Navigation should keep working even when browser persistence is blocked.
  }
}
