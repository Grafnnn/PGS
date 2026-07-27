"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  FileText,
  Gauge,
  Landmark,
  Layers3,
  Menu,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  X
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { PwaRegister } from "@/components/pwa-register";
import { isStandaloneAppSurface } from "@/components/app-nav-routes";
import { readSidebarPreference, type SidebarPreference, writeSidebarPreference } from "@/components/app-nav-state";

type NavItem = {
  code: string;
  group: "Управление" | "Проектный контур" | "Система";
  href: string;
  icon: ReactNode;
  label: string;
  section?: string;
  match?: string[];
};

const navItems: NavItem[] = [
  { code: "01", group: "Управление", href: "/dashboard", icon: <Gauge size={17} />, label: "Главная", section: "Сводка портфеля", match: ["/dashboard"] },
  { code: "02", group: "Управление", href: "/inbox", icon: <Bell size={17} />, label: "Согласования", section: "Решения и блокеры", match: ["/inbox"] },
  { code: "03", group: "Управление", href: "/portfolio", icon: <Layers3 size={17} />, label: "Портфель", section: "Все объекты", match: ["/portfolio"] },
  { code: "04", group: "Управление", href: "/projects", icon: <BriefcaseBusiness size={17} />, label: "Проекты", section: "Рабочие пространства", match: ["/projects"] },
  { code: "05", group: "Проектный контур", href: "/projects", icon: <PackageCheck size={17} />, label: "Снабжение", section: "Материалы и закупки" },
  { code: "06", group: "Проектный контур", href: "/projects", icon: <Landmark size={17} />, label: "Финансы", section: "Бюджет и cash-flow" },
  { code: "07", group: "Проектный контур", href: "/projects", icon: <FileText size={17} />, label: "Документы", section: "Комплектность и КС" },
  { code: "08", group: "Проектный контур", href: "/projects", icon: <ShieldAlert size={17} />, label: "Риски", section: "Контроль отклонений" },
  { code: "AI", group: "Система", href: "/projects", icon: <Bot size={17} />, label: "AI-помощник", section: "Сценарии и сводки" },
  { code: "09", group: "Система", href: "/admin/users", icon: <Users size={17} />, label: "Администрирование", section: "Пользователи и связи", match: ["/admin"] }
];
const navGroups: NavItem["group"][] = ["Управление", "Проектный контур", "Система"];

function isItemActive(pathname: string, item: NavItem) {
  return item.match?.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ?? false;
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="nav sidebar-nav" aria-label="Основная навигация">
      {navGroups.map((group) => (
        <div className="nav-group" key={group}>
          <span className="nav-group-label">{group}</span>
          <div className="nav-group-links">
            {navItems.filter((item) => item.group === group).map((item) => {
              const active = isItemActive(pathname, item);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : undefined}
                  data-tooltip={item.label}
                  href={item.href as Route}
                  key={`${item.label}-${item.href}`}
                  onClick={onNavigate}
                  title={item.label}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="nav-code" aria-hidden="true">
                    {item.code}
                  </span>
                  <span className="nav-copy">
                    <strong>{item.label}</strong>
                    <small>{item.section}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarSystemCard() {
  return (
    <div className="sidebar-system-card">
      <span className="sidebar-system-icon"><SlidersHorizontal size={16} /></span>
      <div>
        <strong>PGS Studio v3</strong>
        <span>Единый контур управления</span>
      </div>
      <span aria-label="Система активна" className="sidebar-system-status" role="status" title="Система активна" />
    </div>
  );
}

function InboxBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/inbox?summary=1", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { summary?: { unread?: number } };
        if (active) setUnread(Math.max(0, Number(body.summary?.unread) || 0));
      } catch {
        // The navigation remains usable while auth or the database is unavailable.
      }
    }
    void refresh();
    window.addEventListener("pgs:inbox-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("pgs:inbox-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <Link aria-label={unread ? `Inbox: ${unread} непрочитанных` : "Inbox"} className="icon-button inbox-bell" href={"/inbox" as Route} title="Notifications & Approval Inbox">
      <Bell size={17} />
      {unread > 0 && <span className="inbox-bell-count">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
  onTogglePinned
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onTogglePinned?: () => void;
}) {
  return (
    <>
      <div className="sidebar-header">
        <BrandLogo compact={collapsed} />
        {onTogglePinned && (
          <button
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-expanded={!collapsed}
            className="icon-button sidebar-pin-button"
            onClick={onTogglePinned}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            type="button"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}
      </div>
      <NavigationLinks onNavigate={onNavigate} />
      <SidebarSystemCard />
    </>
  );
}

export function AppNav({ children }: { children: ReactNode }) {
  const sidebarId = useId();
  const drawerId = useId();
  const pathname = usePathname();
  const [preference, setPreference] = useState<SidebarPreference>("expanded");
  const [hydrated, setHydrated] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const saved = readSidebarPreference(window.localStorage);
    if (saved) {
      setPreference(saved);
    } else if (window.matchMedia("(min-width: 768px) and (max-width: 1279px)").matches) {
      setPreference("collapsed");
    }
    setHydrated(true);
  }, []);

  const closeTransientNavigation = useCallback(() => {
    setPeekOpen(false);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeTransientNavigation();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeTransientNavigation]);

  const setPinnedPreference = useCallback((next: SidebarPreference) => {
    setPreference(next);
    writeSidebarPreference(window.localStorage, next);
    setPeekOpen(false);
  }, []);

  const togglePreference = useCallback(() => {
    setPinnedPreference(preference === "expanded" ? "collapsed" : "expanded");
  }, [preference, setPinnedPreference]);

  const shellState = hydrated ? preference : "expanded";
  const isCollapsed = shellState === "collapsed";
  const sidebarExpandedForInteraction = isCollapsed && peekOpen;
  const activeItem = navItems.find((item) => isItemActive(pathname, item));
  const isStandaloneSurface = isStandaloneAppSurface(pathname);

  if (isStandaloneSurface) {
    return (
      <div className="auth-shell">
        <PwaRegister />
        {children}
      </div>
    );
  }

  return (
    <div className="app-shell" data-sidebar={shellState}>
      <PwaRegister />
      <aside
        className={`sidebar app-sidebar ${isCollapsed ? "is-collapsed" : "is-expanded"} ${sidebarExpandedForInteraction ? "is-peek-open" : ""}`}
        id={sidebarId}
        onMouseEnter={() => {
          if (isCollapsed) setPeekOpen(true);
        }}
        onMouseLeave={() => setPeekOpen(false)}
      >
        <SidebarContent collapsed={isCollapsed && !sidebarExpandedForInteraction} onTogglePinned={togglePreference} />
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            aria-controls={drawerId}
            aria-expanded={drawerOpen}
            aria-label="Открыть меню"
            className="icon-button mobile-menu-button"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <Menu size={17} />
          </button>
          <button
            aria-controls={sidebarId}
            aria-expanded={!isCollapsed || sidebarExpandedForInteraction}
            aria-label={isCollapsed ? "Открыть меню поверх рабочей области" : "Свернуть меню"}
            className="icon-button desktop-menu-button"
            onClick={() => {
              if (isCollapsed) setPeekOpen((value) => !value);
              else togglePreference();
            }}
            title={isCollapsed ? "Открыть меню" : "Свернуть меню"}
            type="button"
          >
            {isCollapsed ? <Menu size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <div className="topbar-route">
            <span>PGS Studio</span>
            <strong>{activeItem?.label ?? "Рабочая область"}</strong>
          </div>
          <label className="global-search" aria-label="Поиск по PGS">
            <Search size={17} />
            <input placeholder="Поиск по проектам и данным" />
          </label>
          <div className="topbar-actions">
            <span className="topbar-context"><i /> Операционный контур</span>
            <InboxBell />
            <Link className="button primary" href="/projects#create-project" title="Перейти к созданию проекта">
              <Plus size={17} />
              <span className="topbar-create-label">Создать</span>
            </Link>
          </div>
        </header>
        {children}
      </div>

      <div className={`drawer-backdrop ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />
      <aside aria-hidden={!drawerOpen} className={`sidebar mobile-drawer ${drawerOpen ? "open" : ""}`} id={drawerId}>
        <div className="sidebar-header">
          <BrandLogo />
          <button aria-label="Закрыть меню" className="icon-button" onClick={() => setDrawerOpen(false)} title="Закрыть меню" type="button">
            <X size={17} />
          </button>
        </div>
        <NavigationLinks onNavigate={() => setDrawerOpen(false)} />
        <SidebarSystemCard />
      </aside>
    </div>
  );
}
