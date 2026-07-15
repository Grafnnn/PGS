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
import { readSidebarPreference, type SidebarPreference, writeSidebarPreference } from "@/components/app-nav-state";

type NavItem = {
  code: string;
  href: string;
  icon: ReactNode;
  label: string;
  section?: string;
  match?: string[];
};

const navItems: NavItem[] = [
  { code: "00", href: "/dashboard", icon: <Gauge size={17} />, label: "Dashboard", section: "Портфель", match: ["/dashboard"] },
  { code: "01", href: "/projects", icon: <BriefcaseBusiness size={17} />, label: "Projects", section: "Объекты", match: ["/projects"] },
  { code: "02", href: "/projects", icon: <PackageCheck size={17} />, label: "Procurement", section: "Снабжение" },
  { code: "03", href: "/projects", icon: <Landmark size={17} />, label: "Finance", section: "Деньги" },
  { code: "04", href: "/projects", icon: <FileText size={17} />, label: "Docs", section: "Документы" },
  { code: "05", href: "/projects", icon: <ShieldAlert size={17} />, label: "Risks", section: "Контроль" },
  { code: "AI", href: "/projects", icon: <Bot size={17} />, label: "AI Layer", section: "Анализ" },
  { code: "99", href: "/admin/users", icon: <Users size={17} />, label: "Admin", section: "Настройки", match: ["/admin"] }
];

function isItemActive(pathname: string, item: NavItem) {
  return item.match?.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ?? false;
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="nav sidebar-nav" aria-label="Основная навигация">
      {navItems.map((item) => {
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
    </nav>
  );
}

function SidebarSystemCard() {
  return (
    <div className="sidebar-system-card">
      <SlidersHorizontal size={17} />
      <div>
        <strong>PGS v2</strong>
        <span>ВОР · КС · Договор · Риски</span>
      </div>
    </div>
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
          <label className="global-search" aria-label="Поиск по PGS">
            <Search size={17} />
            <input placeholder="Поиск по объектам, ВОР, КС, документам" />
          </label>
          <div className="topbar-actions">
            <span className="topbar-context">Демо Строй · Command Center</span>
            <button className="icon-button" type="button" aria-label="Уведомления">
              <Bell size={17} />
            </button>
            <Link className="button primary" href="/projects#create-project" title="Перейти к созданию проекта">
              <Plus size={17} />
              Создать
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
