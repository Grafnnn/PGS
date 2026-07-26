"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  ClipboardList,
  DatabaseZap,
  FileText,
  HardHat,
  Landmark,
  LayoutGrid,
  ListChecks,
  MessageSquareText,
  Package,
  ReceiptText,
  Search,
  Send,
  Table2,
  TimerReset,
  Trash2,
  Truck,
  Users,
  Workflow
} from "lucide-react";

export const projectTabs = [
  "Обзор",
  "Бюджет / ВОР",
  "График",
  "Материалы",
  "Заявки",
  "Финансы",
  "ERP / Учёт",
  "Договор / Тендер",
  "КП / Подача",
  "КС",
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

export const projectTabGroups: ReadonlyArray<{ label: string; tabs: readonly ProjectTab[] }> = [
  {
    label: "Управление",
    tabs: ["Обзор", "Действия", "Аналитика", "Участники", "История", "Настройки", "AI-помощник"]
  },
  {
    label: "Контур работ",
    tabs: ["Площадка", "Рапорты", "Исполнение", "График", "Материалы", "Заявки"]
  },
  {
    label: "Коммерция",
    tabs: ["Бюджет / ВОР", "Финансы", "ERP / Учёт", "Договор / Тендер", "КП / Подача", "КС"]
  },
  {
    label: "Контроль",
    tabs: ["Документы", "RFI / Согласования", "Риски", "Процессы"]
  }
];

const tabMeta: Record<ProjectTab, { code: string; icon: React.ReactNode; hint: string }> = {
  Обзор: { code: "00", icon: <LayoutGrid size={17} />, hint: "Сводка проекта" },
  "Бюджет / ВОР": { code: "01", icon: <Table2 size={17} />, hint: "Объемы и бюджет" },
  График: { code: "02", icon: <TimerReset size={17} />, hint: "Сроки и этапы" },
  Материалы: { code: "03", icon: <Package size={17} />, hint: "Потребность" },
  Заявки: { code: "04", icon: <Truck size={17} />, hint: "Закупки" },
  Финансы: { code: "05", icon: <Landmark size={17} />, hint: "Платежи и cash-flow" },
  "ERP / Учёт": { code: "ERP", icon: <DatabaseZap size={17} />, hint: "Обмен с учетом" },
  "Договор / Тендер": { code: "06", icon: <Search size={17} />, hint: "Контракт" },
  "КП / Подача": { code: "07", icon: <Send size={17} />, hint: "Предложение" },
  КС: { code: "08", icon: <ReceiptText size={17} />, hint: "Закрытие объемов" },
  Исполнение: { code: "09", icon: <Users size={17} />, hint: "Подрядчики" },
  Площадка: { code: "FS", icon: <HardHat size={17} />, hint: "Работы на объекте" },
  Рапорты: { code: "10", icon: <ClipboardList size={17} />, hint: "Ежедневный факт" },
  Риски: { code: "11", icon: <AlertTriangle size={17} />, hint: "Отклонения" },
  Документы: { code: "12", icon: <FileText size={17} />, hint: "Файлы и версии" },
  "RFI / Согласования": { code: "13", icon: <MessageSquareText size={17} />, hint: "Запросы и ответы" },
  Действия: { code: "14", icon: <ListChecks size={17} />, hint: "Задачи команды" },
  Процессы: { code: "WF", icon: <Workflow size={17} />, hint: "Маршруты согласования" },
  Аналитика: { code: "15", icon: <BarChart3 size={17} />, hint: "EVM и KPI" },
  Участники: { code: "16", icon: <Users size={17} />, hint: "Команда и доступ" },
  История: { code: "17", icon: <ClipboardList size={17} />, hint: "Аудит изменений" },
  Настройки: { code: "18", icon: <Trash2 size={17} />, hint: "Параметры проекта" },
  "AI-помощник": { code: "AI", icon: <Bot size={17} />, hint: "Сценарии анализа" }
};

export function ProjectModuleMenu({
  activeTab,
  defaultOpen = false,
  onSelect
}: {
  activeTab: ProjectTab;
  defaultOpen?: boolean;
  onSelect: (tab: ProjectTab) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeMeta = tabMeta[activeTab];

  useEffect(() => {
    if (!open) return;

    const popover = rootRef.current?.querySelector<HTMLElement>(".project-module-popover");
    const popoverBounds = popover?.getBoundingClientRect();
    if (popoverBounds && (popoverBounds.bottom > window.innerHeight || popoverBounds.top < 0)) {
      rootRef.current?.scrollIntoView({ block: "start" });
    }

    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectTab = (tab: ProjectTab) => {
    onSelect(tab);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={`project-module-nav ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        className="project-module-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="project-module-trigger-icon" aria-hidden="true">{activeMeta.icon}</span>
        <span className="project-module-trigger-copy">
          <small>Раздел проекта</small>
          <strong>{activeTab}</strong>
          <span>{activeMeta.hint}</span>
        </span>
        <span className="project-module-trigger-count">{projectTabs.length} раздела</span>
        <ChevronDown className="project-module-chevron" size={18} aria-hidden="true" />
      </button>

      {open ? (
        <div aria-label="Все разделы проекта" className="project-module-popover" id={menuId} role="region">
          <div className="project-module-popover-head">
            <div>
              <small>Навигация по проекту</small>
              <strong>Все разделы</strong>
            </div>
            <span>{projectTabs.length} рабочие зоны</span>
          </div>
          <div className="project-module-grid">
            {projectTabGroups.map((group) => (
              <section className="project-module-group" key={group.label}>
                <h3>{group.label}</h3>
                <div className="project-module-items">
                  {group.tabs.map((tab) => {
                    const meta = tabMeta[tab];
                    const active = tab === activeTab;
                    return (
                      <button
                        aria-current={active ? "page" : undefined}
                        className={`project-module-item ${active ? "active" : ""}`}
                        key={tab}
                        onClick={() => selectTab(tab)}
                        type="button"
                      >
                        <span className="project-module-item-icon" aria-hidden="true">{meta.icon}</span>
                        <span className="project-module-item-copy">
                          <strong>{tab}</strong>
                          <small>{meta.hint}</small>
                        </span>
                        <span className="project-module-code">{meta.code}</span>
                        {active ? <Check className="project-module-check" size={16} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
