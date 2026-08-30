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
  LayoutGrid,
  ListChecks,
  MessageSquareText,
  Package,
  ReceiptText,
  Search,
  Send,
  Settings2,
  Table2,
  TimerReset,
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

export type ProjectDomainId = Exclude<ProjectTabGroup["id"], "system">;

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

export const projectDomainGroups = projectTabGroups.filter(
  (group): group is ProjectTabGroup & { id: ProjectDomainId } => !group.service
);

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
  Настройки: { icon: <Settings2 size={16} />, hint: "Параметры проекта" },
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

export function getMenuArrowTarget(key: string, currentIndex: number, itemCount: number) {
  if (itemCount <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") return (currentIndex + 1) % itemCount;
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  return null;
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
  defaultOpen?: boolean | ProjectDomainId;
  onSelect: (tab: ProjectTab) => void;
}) {
  const activeGroup = groupForTab(activeTab);
  const [openNavigation, setOpenNavigation] = useState<
    { kind: "all" } | { kind: "domain"; domainId: ProjectDomainId } | null
  >(defaultOpen === true ? { kind: "all" } : typeof defaultOpen === "string" ? { kind: "domain", domainId: defaultOpen } : null);
  const [query, setQuery] = useState("");
  const navigationRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const domainPopoverRef = useRef<HTMLDivElement>(null);
  const domainItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const domainTriggerRefs = useRef<Partial<Record<ProjectDomainId, HTMLButtonElement | null>>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const allModulesTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingDomainFocusRef = useRef<"first" | "last" | null>(null);
  const allModulesOpen = openNavigation?.kind === "all";
  const openDomainId = openNavigation?.kind === "domain" ? openNavigation.domainId : null;
  const openDomain = openDomainId ? projectDomainGroups.find((group) => group.id === openDomainId) ?? null : null;
  const openDomainIndex = openDomain ? projectDomainGroups.findIndex((group) => group.id === openDomain.id) : 0;

  const closeNavigation = useCallback((restoreFocus = true) => {
    const trigger = lastTriggerRef.current;
    setOpenNavigation(null);
    setQuery("");
    pendingDomainFocusRef.current = null;
    if (restoreFocus) requestAnimationFrame(() => trigger?.focus());
  }, []);

  useEffect(() => {
    const closeForGlobalNavigation = () => closeNavigation(false);
    window.addEventListener("pgs:global-navigation-open", closeForGlobalNavigation);
    return () => window.removeEventListener("pgs:global-navigation-open", closeForGlobalNavigation);
  }, [closeNavigation]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 820px)");
    const preserveMobileSwitcher = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!event.matches) return;
      setOpenNavigation((current) => {
        if (current?.kind !== "domain") return current;
        lastTriggerRef.current = mobileTriggerRef.current ?? lastTriggerRef.current;
        return { kind: "all" };
      });
    };
    preserveMobileSwitcher(mobileViewport);
    mobileViewport.addEventListener("change", preserveMobileSwitcher);
    return () => mobileViewport.removeEventListener("change", preserveMobileSwitcher);
  }, []);

  useEffect(() => {
    if (!allModulesOpen) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigation();
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
      document.removeEventListener("keydown", close);
    };
  }, [allModulesOpen, closeNavigation]);

  useEffect(() => {
    if (!openDomainId) return;
    const focusTarget = pendingDomainFocusRef.current;
    pendingDomainFocusRef.current = null;
    if (focusTarget) {
      requestAnimationFrame(() => {
        const items = domainItemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
        const target = focusTarget === "last" ? items[items.length - 1] : items[0];
        target?.focus();
      });
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) closeNavigation(false);
    }

    function handleFocusIn(event: FocusEvent) {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) closeNavigation(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeNavigation();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeNavigation, openDomainId]);

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
    closeNavigation();
  }

  function openDomainMenu(domainId: ProjectDomainId, trigger: HTMLButtonElement, focusTarget: "first" | "last" | null = null) {
    window.dispatchEvent(new Event("pgs:project-navigation-open"));
    lastTriggerRef.current = trigger;
    pendingDomainFocusRef.current = focusTarget;
    domainItemRefs.current = [];
    setQuery("");
    setOpenNavigation({ kind: "domain", domainId });
  }

  function openAllModules(trigger: HTMLButtonElement) {
    window.dispatchEvent(new Event("pgs:project-navigation-open"));
    lastTriggerRef.current = trigger;
    setQuery("");
    setOpenNavigation({ kind: "all" });
  }

  function moveDomainTrigger(currentId: ProjectDomainId, offset: -1 | 1) {
    const currentIndex = projectDomainGroups.findIndex((group) => group.id === currentId);
    const nextIndex = (currentIndex + offset + projectDomainGroups.length) % projectDomainGroups.length;
    const nextGroup = projectDomainGroups[nextIndex];
    const nextTrigger = domainTriggerRefs.current[nextGroup.id];
    nextTrigger?.focus();
    if (openDomainId) openDomainMenu(nextGroup.id, nextTrigger ?? lastTriggerRef.current ?? domainTriggerRefs.current[currentId]!);
  }

  function handleDomainTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, domainId: ProjectDomainId) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openDomainMenu(domainId, event.currentTarget, event.key === "ArrowUp" ? "last" : "first");
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveDomainTrigger(domainId, event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "Escape" && openDomainId === domainId) {
      event.preventDefault();
      closeNavigation();
    }
  }

  function handleDomainItemKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number, itemCount: number) {
    const targetIndex = getMenuArrowTarget(event.key, index, itemCount);
    if (targetIndex === null) {
      if (event.key === "Tab") closeNavigation(false);
      return;
    }
    event.preventDefault();
    domainItemRefs.current[targetIndex]?.focus();
  }

  return (
    <div
      className="project-atlas-navigation"
      data-project-navigation-state={allModulesOpen ? "all" : openDomainId ? "domain" : "closed"}
      ref={navigationRef}
    >
      <nav className="project-atlas-domains" aria-label="Рабочие контуры проекта">
        {projectDomainGroups.map((group) => {
          const active = group.tabs.includes(activeTab);
          const expanded = openDomainId === group.id;
          return (
            <button
              aria-controls={`project-domain-menu-${group.id}`}
              aria-current={active ? "page" : undefined}
              aria-expanded={expanded}
              aria-haspopup="menu"
              className={active ? "active" : undefined}
              data-project-domain-id={group.id}
              data-project-domain-trigger="true"
              data-state={expanded ? "open" : "closed"}
              id={`project-domain-trigger-${group.id}`}
              key={group.id}
              onClick={(event) => expanded ? closeNavigation() : openDomainMenu(group.id, event.currentTarget)}
              onKeyDown={(event) => handleDomainTriggerKeyDown(event, group.id)}
              ref={(element) => {
                domainTriggerRefs.current[group.id] = element;
              }}
              type="button"
            >
              <span aria-hidden="true">{group.icon}</span>
              <strong>{group.label}</strong>
              <ChevronDown className="project-domain-chevron" size={14} aria-hidden="true" />
              {active ? <small>{activeTab}</small> : null}
            </button>
          );
        })}
        <button
          aria-controls="project-all-modules-dialog"
          aria-expanded={allModulesOpen}
          aria-haspopup="dialog"
          className="project-atlas-all"
          data-project-all-modules-trigger="true"
          onClick={(event) => allModulesOpen ? closeNavigation() : openAllModules(event.currentTarget)}
          ref={allModulesTriggerRef}
          type="button"
        >
          <LayoutGrid size={17} />
          <strong>Все модули</strong>
          <ChevronDown size={15} />
        </button>
      </nav>

      {openDomain ? (
        <div
          aria-labelledby={`project-domain-trigger-${openDomain.id}`}
          className="project-domain-popover"
          data-bounded="true"
          data-project-domain-id={openDomain.id}
          data-project-domain-popover="true"
          id={`project-domain-menu-${openDomain.id}`}
          ref={domainPopoverRef}
          role="menu"
          style={{ "--project-domain-anchor": `${((openDomainIndex + 0.5) / 7) * 100}%` } as React.CSSProperties}
        >
          <header className="project-domain-popover-header">
            <span className="project-domain-icon" aria-hidden="true">{openDomain.icon}</span>
            <span><strong>{openDomain.label}</strong><small>{openDomain.description}</small></span>
          </header>
          <div className="project-domain-modules">
            {openDomain.tabs.map((tab, index) => {
              const active = tab === activeTab;
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : undefined}
                  data-current={active ? "true" : "false"}
                  data-project-module={tab}
                  key={tab}
                  onClick={() => selectTab(tab)}
                  onKeyDown={(event) => handleDomainItemKeyDown(event, index, openDomain.tabs.length)}
                  ref={(element) => {
                    domainItemRefs.current[index] = element;
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  type="button"
                >
                  <span aria-hidden="true">{tabMeta[tab].icon}</span>
                  <span><strong>{tab}</strong><small>{tabMeta[tab].hint}</small></span>
                  {active ? <Check size={15} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        aria-controls="project-all-modules-dialog"
        aria-expanded={allModulesOpen}
        aria-haspopup="dialog"
        aria-label={`Открыть разделы проекта. Текущий раздел: ${activeTab}`}
        className="project-navigation-mobile-trigger"
        data-project-mobile-switcher-trigger="true"
        onClick={(event) => allModulesOpen ? closeNavigation() : openAllModules(event.currentTarget)}
        ref={mobileTriggerRef}
        type="button"
      >
        <span aria-hidden="true">{activeGroup.icon}</span>
        <span><small>{activeGroup.label}</small><strong>{activeTab}</strong></span>
        <LayoutGrid size={18} aria-hidden="true" />
      </button>

      {allModulesOpen ? (
        <>
          <button aria-label="Закрыть разделы проекта" className="project-navigation-backdrop" onClick={() => closeNavigation()} type="button" />
          <aside
            aria-label="Разделы проекта"
            aria-modal="true"
            className="project-atlas-mega"
            data-project-all-modules="true"
            data-project-mobile-switcher="true"
            id="project-all-modules-dialog"
            ref={drawerRef}
            role="dialog"
          >
            <header className="project-domain-nav-header">
              <div><small>Карта проекта</small><strong>Все рабочие модули</strong></div>
              <button aria-label="Закрыть разделы проекта" onClick={() => closeNavigation()} title="Закрыть" type="button"><X size={18} /></button>
            </header>

            <label className="project-domain-search">
              <Search size={17} aria-hidden="true" />
              <input aria-label="Найти модуль проекта" onChange={(event) => setQuery(event.target.value)} placeholder="Название модуля или действие" ref={searchInputRef} type="search" value={query} />
              {query ? <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button"><X size={14} /></button> : <span className="project-domain-search-count">{projectTabs.length}</span>}
            </label>

            <div className="project-atlas-mega-grid">
              {visibleGroups.map((group) => (
                <section className={`project-domain ${group.service ? "is-service" : ""} ${group.tabs.includes(activeTab) ? "is-active" : ""}`} key={group.id}>
                  <header><span className="project-domain-icon" aria-hidden="true">{group.icon}</span><span><strong>{group.label}</strong><small>{group.description}</small></span></header>
                  <div className="project-domain-modules">
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
              ))}
              {!visibleGroups.length ? <div className="project-domain-empty">Модуль не найден</div> : null}
            </div>

            <footer className="project-domain-footer"><span>{projectTabs.length} модулей · быстрый переход без вложенной прокрутки страницы</span></footer>
          </aside>
        </>
      ) : null}
    </div>
  );
}
