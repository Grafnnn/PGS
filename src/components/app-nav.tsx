"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  ChevronRight,
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
import { readSidebarPreference, type SidebarPreference, writeSidebarPreference } from "@/components/app-nav-state";

type NavItem = {
  href: string;
  icon: ReactNode;
  label: string;
  section?: string;
  match?: string[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", icon: <Gauge size={17} />, label: "Дашборд", section: "Портфель", match: ["/dashboard"] },
  { href: "/projects", icon: <BriefcaseBusiness size={17} />, label: "Проекты", section: "Объекты", match: ["/projects"] },
  { href: "/projects/project-demo", icon: <PackageCheck size={17} />, label: "Снабжение", section: "Операции" },
  { href: "/projects/project-demo", icon: <Landmark size={17} />, label: "Финансы", section: "Деньги" },
  { href: "/projects/project-demo", icon: <FileText size={17} />, label: "Документы", section: "Контроль" },
  { href: "/projects/project-demo", icon: <ShieldAlert size={17} />, label: "Риски", section: "Контроль" },
  { href: "/projects/project-demo", icon: <Bot size={17} />, label: "AI", section: "Анализ" },
  { href: "/admin/users", icon: <Users size={17} />, label: "Администрирование", section: "Настройки", match: ["/admin"] }
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
        <strong>Контур v0.9</strong>
        <span>Бюджет · Сроки · Снабжение</span>
      </div>
    </div>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
  onPinExpanded,
  onTogglePinned
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onPinExpanded?: () => void;
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
        {onPinExpanded && (
          <button aria-label="Закрепить широкое меню" className="icon-button sidebar-pin-button" onClick={onPinExpanded} title="Закрепить широкое меню" type="button">
            <ChevronRight size={17} />
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
  const [overlayOpen, setOverlayOpen] = useState(false);
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
    setOverlayOpen(false);
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
    setOverlayOpen(false);
  }, []);

  const togglePreference = useCallback(() => {
    setPinnedPreference(preference === "expanded" ? "collapsed" : "expanded");
  }, [preference, setPinnedPreference]);

  const shellState = hydrated ? preference : "expanded";
  const isCollapsed = shellState === "collapsed";

  return (
    <div className="app-shell" data-sidebar={shellState}>
      <aside
        className={`sidebar app-sidebar ${isCollapsed ? "is-collapsed" : "is-expanded"}`}
        id={sidebarId}
        onMouseEnter={() => {
          if (isCollapsed) setOverlayOpen(true);
        }}
        onMouseLeave={() => setOverlayOpen(false)}
      >
        <SidebarContent collapsed={isCollapsed} onTogglePinned={togglePreference} />
      </aside>

      {isCollapsed && <div className={`sidebar-overlay-scrim ${overlayOpen ? "open" : ""}`} onClick={() => setOverlayOpen(false)} />}
      {isCollapsed && (
        <aside
          aria-hidden={!overlayOpen}
          className={`sidebar sidebar-overlay ${overlayOpen ? "open" : ""}`}
          onMouseEnter={() => setOverlayOpen(true)}
          onMouseLeave={() => setOverlayOpen(false)}
        >
          <SidebarContent onPinExpanded={() => setPinnedPreference("expanded")} />
        </aside>
      )}

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
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Открыть меню поверх рабочей области" : "Свернуть меню"}
            className="icon-button desktop-menu-button"
            onClick={() => {
              if (isCollapsed) setOverlayOpen((value) => !value);
              else togglePreference();
            }}
            title={isCollapsed ? "Открыть меню" : "Свернуть меню"}
            type="button"
          >
            {isCollapsed ? <Menu size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <label className="global-search" aria-label="Поиск по PGS">
            <Search size={17} />
            <input placeholder="Поиск: объект, ВОР, документ, риск" />
          </label>
          <div className="topbar-actions">
            <span className="topbar-context">ООО Демо Строй · Алексей Орлов</span>
            <button className="icon-button" type="button" aria-label="Уведомления">
              <Bell size={17} />
            </button>
            <button className="button primary" type="button">
              <Plus size={17} />
              Создать
            </button>
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
