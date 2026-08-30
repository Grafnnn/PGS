"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  ClipboardList,
  DatabaseZap,
  FileCheck2,
  FileText,
  FolderKanban,
  HardHat,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Package,
  ReceiptText,
  Search,
  Send,
  Settings2,
  Table2,
  TimerReset,
  Trash2,
  Truck,
  Users,
  Workflow,
  X
} from "lucide-react";

export const projectTabs = [
  "Обзор",
  "Бюджет / ВОР",
  "ФОТ",
  "График",
  "Материалы",
  "Заявки",
  "Финансы",
  "ERP / Учёт",
  "Договор / Тендер",
  "КП / Подача",
  "КС",
  "Сдача / Гарантия",
  "Исполнение",
  "Площадка",
  "Рапорты",
  "Риски",
  "Документы",
  "RFI / Согласования",
  "Действия",
  "Процессы",
  "Аналитика",
  "Участники",
  "История",
  "Настройки",
  "AI-помощник"
] as const;

export type ProjectTab = (typeof projectTabs)[number];

export type ProjectTabGroup = {
  id: "control" | "production" | "resources" | "economy" | "documents" | "acceptance" | "system";
  label: string;
  description: string;
  icon: React.ReactNode;
  tabs: readonly ProjectTab[];
  service?: boolean;
};

export const projectTabGroups: ReadonlyArray<ProjectTabGroup> = [
  {
    id: "control",
    label: "Центр управления",
    description: "Сводка, решения и прогноз",
    icon: <LayoutDashboard size={18} />,
    tabs: ["Обзор", "Действия", "Аналитика", "Риски", "AI-помощник"]
  },
  {
    id: "production",
    label: "Производство",
    description: "График, площадка и факт",
    icon: <CalendarRange size={18} />,
    tabs: ["График", "Площадка", "Рапорты", "Исполнение"]
  },
  {
    id: "resources",
    label: "Ресурсы",
    description: "Люди, материалы и закупки",
    icon: <Boxes size={18} />,
    tabs: ["ФОТ", "Материалы", "Заявки"]
  },
  {
    id: "economy",
    label: "Экономика",
    description: "ВОР, прогноз и денежный поток",
    icon: <Landmark size={18} />,
    tabs: ["Бюджет / ВОР", "Финансы", "ERP / Учёт"]
  },
  {
    id: "documents",
    label: "Документы и контроль",
    description: "Реестр, договор и согласования",
    icon: <FolderKanban size={18} />,
    tabs: ["Документы", "Договор / Тендер", "КП / Подача", "RFI / Согласования"]
  },
  {
    id: "acceptance",
    label: "Приёмка",
    description: "КС, сдача и гарантия",
    icon: <FileCheck2 size={18} />,
    tabs: ["КС", "Сдача / Гарантия"]
  },
  {
    id: "system",
    label: "Система проекта",
    description: "Команда, процессы и аудит",
    icon: <Settings2 size={18} />,
    tabs: ["Участники", "Процессы", "История", "Настройки"],
    service: true
  }
];

const tabMeta: Record<ProjectTab, { icon: React.ReactNode; hint: string }> = {
  Обзор: { icon: <LayoutDashboard size={16} />, hint: "Состояние и решения" },
  "Бюджет / ВОР": { icon: <Table2 size={16} />, hint: "Объёмы и себестоимость" },
  ФОТ: { icon: <Users size={16} />, hint: "Люди и начисления" },
  График: { icon: <TimerReset size={16} />, hint: "Сроки и этапы" },
  Материалы: { icon: <Package size={16} />, hint: "Потребность объекта" },
  Заявки: { icon: <Truck size={16} />, hint: "Закупки и поставки" },
  Финансы: { icon: <Landmark size={16} />, hint: "Платежи и cash-flow" },
  "ERP / Учёт": { icon: <DatabaseZap size={16} />, hint: "Сверка с учётом" },
  "Договор / Тендер": { icon: <Search size={16} />, hint: "Контракт и условия" },
  "КП / Подача": { icon: <Send size={16} />, hint: "Коммерческое предложение" },
  КС: { icon: <ReceiptText size={16} />, hint: "Предъявление объёмов" },
  "Сдача / Гарантия": { icon: <BadgeCheck size={16} />, hint: "Передача и обязательства" },
  Исполнение: { icon: <Building2 size={16} />, hint: "Подрядчики и фронты" },
  Площадка: { icon: <HardHat size={16} />, hint: "Работы на объекте" },
  Рапорты: { icon: <ClipboardList size={16} />, hint: "Ежедневный факт" },
  Риски: { icon: <AlertTriangle size={16} />, hint: "Отклонения и меры" },
  Документы: { icon: <FileText size={16} />, hint: "Файлы и версии" },
  "RFI / Согласования": { icon: <MessageSquareText size={16} />, hint: "Запросы и ответы" },
  Действия: { icon: <ListChecks size={16} />, hint: "Задачи команды" },
  Процессы: { icon: <Workflow size={16} />, hint: "Маршруты согласования" },
  Аналитика: { icon: <BarChart3 size={16} />, hint: "KPI и прогноз" },
  Участники: { icon: <Users size={16} />, hint: "Команда и доступ" },
  История: { icon: <ClipboardList size={16} />, hint: "Аудит изменений" },
  Настройки: { icon: <Trash2 size={16} />, hint: "Параметры проекта" },
  "AI-помощник": { icon: <Bot size={16} />, hint: "Контекстный анализ" }
};

export function countNoun(value: number, forms: readonly [string, string, string]) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function groupForTab(tab: ProjectTab) {
  return projectTabGroups.find((group) => group.tabs.includes(tab)) ?? projectTabGroups[0];
}

export function ProjectModuleMenu({
  activeTab,
  defaultOpen = false,
  onSelect
}: {
  activeTab: ProjectTab;
  defaultOpen?: boolean;
  onSelect: (tab: ProjectTab) => void;
}) {
  const activeGroup = groupForTab(activeTab);
  const [expandedGroup, setExpandedGroup] = useState<ProjectTabGroup["id"] | null>(activeGroup.id);
  const [mobileOpen, setMobileOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const drawerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    setExpandedGroup(groupForTab(activeTab).id);
  }, [activeTab]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => searchInputRef.current?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobile();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", close);
    };
  }, [closeMobile, mobileOpen]);

  const visibleGroups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalized) return projectTabGroups;
    return projectTabGroups
      .map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => `${tab} ${tabMeta[tab].hint}`.toLocaleLowerCase("ru-RU").includes(normalized))
      }))
      .filter((group) => group.tabs.length);
  }, [query]);

  function selectTab(tab: ProjectTab) {
    onSelect(tab);
    setQuery("");
    if (mobileOpen) closeMobile();
  }

  return (
    <>
      <button
        aria-expanded={mobileOpen}
        aria-label={`Открыть разделы проекта. Текущий раздел: ${activeTab}`}
        className="project-navigation-mobile-trigger"
        onClick={() => {
          setExpandedGroup(activeGroup.id);
          setMobileOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true">{activeGroup.icon}</span>
        <span><small>{activeGroup.label}</small><strong>{activeTab}</strong></span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>

      <aside aria-label="Разделы проекта" className={`project-domain-nav ${mobileOpen ? "is-mobile-open" : ""}`} ref={drawerRef}>
        <header className="project-domain-nav-header">
          <div><small>Навигация проекта</small><strong>Рабочие контуры</strong></div>
          <button aria-label="Закрыть разделы проекта" onClick={closeMobile} title="Закрыть" type="button"><X size={18} /></button>
        </header>

        <label className="project-domain-search">
          <Search size={16} aria-hidden="true" />
          <input aria-label="Найти модуль проекта" onChange={(event) => setQuery(event.target.value)} placeholder="Найти модуль" ref={searchInputRef} type="search" value={query} />
          {query ? <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button"><X size={14} /></button> : null}
        </label>

        <div className="project-domain-list">
          {visibleGroups.map((group) => {
            const expanded = query ? true : expandedGroup === group.id;
            const groupActive = group.tabs.includes(activeTab);
            return (
              <section className={`project-domain ${group.service ? "is-service" : ""} ${groupActive ? "is-active" : ""}`} key={group.id}>
                <button
                  aria-expanded={expanded}
                  className="project-domain-toggle"
                  onClick={() => setExpandedGroup(expanded ? null : group.id)}
                  type="button"
                >
                  <span className="project-domain-icon" aria-hidden="true">{group.icon}</span>
                  <span className="project-domain-copy"><strong>{group.label}</strong><small>{group.description}</small></span>
                  <ChevronDown className="project-domain-chevron" size={16} aria-hidden="true" />
                </button>
                <div className="project-domain-modules" hidden={!expanded}>
                  {group.tabs.map((tab) => {
                    const active = tab === activeTab;
                    return (
                      <button aria-current={active ? "page" : undefined} className={active ? "active" : undefined} key={tab} onClick={() => selectTab(tab)} type="button">
                        <span aria-hidden="true">{tabMeta[tab].icon}</span>
                        <span><strong>{tab}</strong><small>{tabMeta[tab].hint}</small></span>
                        {active ? <Check size={15} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!visibleGroups.length ? <div className="project-domain-empty">Модуль не найден</div> : null}
        </div>

        <footer className="project-domain-footer">
          <span>{projectTabs.length} модулей доступны через 6 рабочих контуров</span>
        </footer>
      </aside>

      {mobileOpen ? <button aria-label="Закрыть разделы проекта" className="project-navigation-backdrop" onClick={closeMobile} type="button" /> : null}
    </>
  );
}
