"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  Gauge,
  Layers3,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Search,
  Users,
  X
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { PwaRegister } from "@/components/pwa-register";
import { isStandaloneAppSurface } from "@/components/app-nav-routes";
import {
  APP_NAVIGATION_GROUPS,
  APP_NAVIGATION_ITEMS,
  type AppNavigationItem,
  filterNavigationItems,
  isNavigationItemActive,
  readSidebarPreference,
  type SidebarPreference,
  writeSidebarPreference
} from "@/components/app-nav-state";

const navigationIcons: Record<AppNavigationItem["id"], ReactNode> = {
  dashboard: <Gauge size={18} />,
  inbox: <Bell size={18} />,
  portfolio: <Layers3 size={18} />,
  projects: <BriefcaseBusiness size={18} />,
  users: <Users size={18} />,
  integrations: <Plug size={18} />
};

function NavigationLinks({
  onClearQuery,
  onNavigate,
  query
}: {
  onClearQuery: () => void;
  onNavigate?: () => void;
  query: string;
}) {
  const pathname = usePathname();
  const filteredItems = filterNavigationItems(APP_NAVIGATION_ITEMS, query);

  return (
    <nav className="nav sidebar-nav" aria-label="Основная навигация">
      {APP_NAVIGATION_GROUPS.map((group) => {
        const groupItems = filteredItems.filter((item) => item.group === group);
        if (!groupItems.length) return null;
        return (
          <div className="nav-group" key={group}>
            <span className="nav-group-label">{group}</span>
            <div className="nav-group-links">
              {groupItems.map((item) => {
                const active = isNavigationItemActive(pathname, item);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={active ? "active" : undefined}
                    data-tooltip={item.label}
                    href={item.href as Route}
                    key={item.id}
                    onClick={onNavigate}
                    title={item.label}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {navigationIcons[item.id]}
                    </span>
                    <span className="nav-copy">
                      <strong>{item.label}</strong>
                      <small>{item.section}</small>
                    </span>
                    <ChevronRight className="nav-arrow" size={15} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
      {!filteredItems.length && (
        <div className="sidebar-search-empty" role="status">
          <Search size={18} aria-hidden="true" />
          <strong>Раздел не найден</strong>
          <span>Попробуйте другое название или модуль.</span>
          <button onClick={onClearQuery} type="button">Сбросить поиск</button>
        </div>
      )}
    </nav>
  );
}

function SidebarSearch({
  onChange,
  onClear,
  value
}: {
  onChange: (value: string) => void;
  onClear: () => void;
  value: string;
}) {
  return (
    <label className="sidebar-search">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label="Найти раздел или модуль"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Раздел или модуль"
        type="search"
        value={value}
      />
      {value && (
        <button aria-label="Очистить поиск" onClick={onClear} title="Очистить поиск" type="button">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

type NavigationUser = {
  authenticated: boolean;
  name: string;
  role: string;
};

function userInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU"))
    .join("") || "PG";
}

function SidebarUserCard({ onNavigate }: { onNavigate?: () => void }) {
  const [user, setUser] = useState<NavigationUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: NavigationUser } | null) => {
        if (active) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  if (!user) {
    return (
      <Link className="sidebar-user-card is-guest" data-tooltip="Войти" href={"/login" as Route} onClick={onNavigate} title="Войти">
        <span className="sidebar-user-avatar" aria-hidden="true"><LogIn size={17} /></span>
        <span className="sidebar-user-copy">
          <strong>Войти в PGS</strong>
          <small>Открыть рабочий контур</small>
        </span>
        <ChevronRight className="sidebar-user-action" size={15} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className="sidebar-user-card" data-tooltip={user.name} title={user.name}>
      <span className="sidebar-user-avatar" aria-hidden="true">{userInitials(user.name)}</span>
      <span className="sidebar-user-copy">
        <strong>{user.name}</strong>
        <small>{user.role}</small>
      </span>
      <button
        aria-label="Выйти из PGS"
        className="sidebar-user-action"
        disabled={loggingOut}
        onClick={() => void logout()}
        title="Выйти"
        type="button"
      >
        <LogOut size={15} />
      </button>
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
  pinnedCollapsed,
  onCloseMobile,
  onNavigate,
  onTogglePinned
}: {
  collapsed?: boolean;
  pinnedCollapsed?: boolean;
  onCloseMobile?: () => void;
  onNavigate?: () => void;
  onTogglePinned?: () => void;
}) {
  const [query, setQuery] = useState("");

  const navigate = useCallback(() => {
    setQuery("");
    onNavigate?.();
  }, [onNavigate]);

  return (
    <>
      <div className="sidebar-header">
        <BrandLogo compact={collapsed} />
        <div className="sidebar-header-actions">
          {onTogglePinned && (
            <button
              aria-label={pinnedCollapsed ? "Закрепить развёрнутое меню" : "Свернуть меню"}
              aria-expanded={!pinnedCollapsed}
              className="icon-button sidebar-pin-button"
              onClick={onTogglePinned}
              title={pinnedCollapsed ? "Закрепить меню" : "Свернуть меню"}
              type="button"
            >
              {pinnedCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          )}
          {onCloseMobile && (
            <button
              aria-label="Закрыть меню"
              className="icon-button sidebar-close-button"
              onClick={onCloseMobile}
              title="Закрыть меню"
              type="button"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      <Link
        className="sidebar-create-link"
        data-tooltip="Новый проект"
        href={"/projects#create-project" as Route}
        onClick={navigate}
        title="Создать новый проект"
      >
        <span className="sidebar-create-icon" aria-hidden="true"><Plus size={17} /></span>
        <span className="sidebar-create-copy">
          <strong>Новый проект</strong>
          <small>Создание и импорт данных</small>
        </span>
        <ChevronRight className="sidebar-create-arrow" size={15} aria-hidden="true" />
      </Link>

      <SidebarSearch onChange={setQuery} onClear={() => setQuery("")} value={query} />
      <NavigationLinks onClearQuery={() => setQuery("")} onNavigate={navigate} query={query} />

      <div className="sidebar-footer">
        <SidebarUserCard onNavigate={navigate} />
      </div>
    </>
  );
}

export function AppNav({ children }: { children: ReactNode }) {
  const sidebarId = useId();
  const pathname = usePathname();
  const [preference, setPreference] = useState<SidebarPreference>("expanded");
  const [hydrated, setHydrated] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasDrawerOpen = useRef(false);

  useEffect(() => {
    const saved = readSidebarPreference(window.localStorage);
    if (saved) {
      setPreference(saved);
    } else if (window.matchMedia("(min-width: 768px) and (max-width: 1279px)").matches) {
      setPreference("collapsed");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      setIsMobileViewport(media.matches);
      if (!media.matches) setDrawerOpen(false);
    };
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  const closeTransientNavigation = useCallback(() => {
    setPeekOpen(false);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    closeTransientNavigation();
  }, [closeTransientNavigation, pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeTransientNavigation();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeTransientNavigation]);

  useEffect(() => {
    if (!drawerOpen || !isMobileViewport) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, isMobileViewport]);

  useEffect(() => {
    if (isMobileViewport && wasDrawerOpen.current && !drawerOpen) {
      mobileMenuButton.current?.focus();
    }
    wasDrawerOpen.current = drawerOpen;
  }, [drawerOpen, isMobileViewport]);

  useEffect(() => () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, []);

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
  const activeItem = APP_NAVIGATION_ITEMS.find((item) => isNavigationItemActive(pathname, item));
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
        aria-hidden={isMobileViewport ? !drawerOpen : undefined}
        className={`sidebar app-sidebar ${isCollapsed ? "is-collapsed" : "is-expanded"} ${sidebarExpandedForInteraction ? "is-peek-open" : ""} ${drawerOpen ? "is-mobile-open" : ""}`}
        id={sidebarId}
        onMouseEnter={() => {
          if (!isCollapsed || isMobileViewport) return;
          if (peekTimer.current) clearTimeout(peekTimer.current);
          peekTimer.current = setTimeout(() => setPeekOpen(true), 140);
        }}
        onMouseLeave={() => {
          if (peekTimer.current) clearTimeout(peekTimer.current);
          setPeekOpen(false);
        }}
      >
        <SidebarContent
          collapsed={!isMobileViewport && isCollapsed && !sidebarExpandedForInteraction}
          onCloseMobile={() => setDrawerOpen(false)}
          onNavigate={closeTransientNavigation}
          onTogglePinned={togglePreference}
          pinnedCollapsed={isCollapsed}
        />
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            aria-controls={sidebarId}
            aria-expanded={drawerOpen}
            aria-label="Открыть меню"
            className="icon-button mobile-menu-button"
            onClick={() => setDrawerOpen(true)}
            ref={mobileMenuButton}
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
    </div>
  );
}
