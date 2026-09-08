"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  Command,
  Gauge,
  Layers3,
  LogIn,
  LogOut,
  Plug,
  Plus,
  Search,
  Users,
  X
} from "lucide-react";
import { type ReactNode, type RefObject, useCallback, useEffect, useId, useRef, useState } from "react";
import { ProjectNavigationHostContext } from "@/components/project-navigation-host";
import { PwaRegister } from "@/components/pwa-register";
import { BrandWordmark } from "@/components/brand-logo";
import { isStandaloneAppSurface } from "@/components/app-nav-routes";
import {
  APP_NAVIGATION_GROUPS,
  APP_NAVIGATION_ITEMS,
  type AppNavigationItem,
  filterNavigationItems,
  isNavigationItemActive
} from "@/components/app-nav-state";

const navigationIcons: Record<AppNavigationItem["id"], ReactNode> = {
  dashboard: <Gauge size={19} />,
  inbox: <Bell size={19} />,
  portfolio: <Layers3 size={19} />,
  projects: <BriefcaseBusiness size={19} />,
  users: <Users size={19} />,
  integrations: <Plug size={19} />
};

function NavigationLinks({
  onClearQuery,
  onNavigate,
  query
}: {
  onClearQuery: () => void;
  onNavigate: () => void;
  query: string;
}) {
  const pathname = usePathname();
  const filteredItems = filterNavigationItems(APP_NAVIGATION_ITEMS, query);

  return (
    <nav className="nav navigation-sheet-links" aria-label="Основная навигация">
      {APP_NAVIGATION_GROUPS.map((group) => {
        const groupItems = filteredItems.filter((item) => item.group === group);
        if (!groupItems.length) return null;
        return (
          <section className="navigation-sheet-group" key={group}>
            <h2>{group}</h2>
            <div className="navigation-sheet-group-items">
              {groupItems.map((item) => {
                const active = isNavigationItemActive(pathname, item);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={active ? "active" : undefined}
                    href={item.href as Route}
                    key={item.id}
                    onClick={onNavigate}
                  >
                    <span className="navigation-sheet-icon" aria-hidden="true">{navigationIcons[item.id]}</span>
                    <span className="navigation-sheet-copy">
                      <strong>{item.label}</strong>
                      <small>{item.section}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {!filteredItems.length && (
        <div className="navigation-search-empty" role="status">
          <Search size={20} aria-hidden="true" />
          <strong>Ничего не найдено</strong>
          <span>Измените запрос или откройте реестр проектов.</span>
          <button onClick={onClearQuery} type="button">Очистить поиск</button>
        </div>
      )}
    </nav>
  );
}

function NavigationSearch({
  inputRef,
  onChange,
  onClear,
  value
}: {
  inputRef: RefObject<HTMLInputElement>;
  onChange: (value: string) => void;
  onClear: () => void;
  value: string;
}) {
  return (
    <label className="navigation-search">
      <Search size={18} aria-hidden="true" />
      <input
        aria-label="Найти раздел или действие"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Найти раздел…"
        ref={inputRef}
        type="search"
        value={value}
      />
      {value ? (
        <button aria-label="Очистить поиск" onClick={onClear} title="Очистить поиск" type="button">
          <X size={15} />
        </button>
      ) : <kbd>⌘ K</kbd>}
    </label>
  );
}

type NavigationUser = {
  authenticated: boolean;
  name: string;
  role: string;
};

type SystemHealth = {
  state: "checking" | "ok" | "degraded" | "unavailable";
  checkedAt?: string;
  detail?: string;
};

function SystemStatusIndicator() {
  const [health, setHealth] = useState<SystemHealth>({ state: "checking" });

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as {
          status?: string;
          database?: string;
          storage?: { writable?: boolean };
          timestamp?: string;
        };
        if (!active) return;
        const state = response.ok && body.status === "ok" ? "ok" : "degraded";
        const detail = [
          `API ${response.status}`,
          body.database ? `DB ${body.database}` : "",
          typeof body.storage?.writable === "boolean" ? `storage ${body.storage.writable ? "ok" : "unavailable"}` : ""
        ].filter(Boolean).join(" · ");
        setHealth({ state, checkedAt: body.timestamp, detail });
      } catch {
        if (active) setHealth({ state: "unavailable", detail: "Проверка health недоступна" });
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const label = health.state === "ok"
    ? "Система в норме"
    : health.state === "checking"
      ? "Проверяю систему"
      : health.state === "degraded"
        ? "Система требует внимания"
        : "Статус недоступен";
  const checked = health.checkedAt
    ? new Date(health.checkedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <span
      aria-live="polite"
      className={`topbar-context status-${health.state}`}
      role="status"
      title={[label, health.detail, checked ? `Проверено ${checked}` : ""].filter(Boolean).join(". ")}
    >
      <i aria-hidden="true" />
      <span>{label}</span>
      {checked ? <time dateTime={health.checkedAt}>на {checked}</time> : null}
    </span>
  );
}

function userInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU"))
    .join("") || "PG";
}

function SidebarUserCard({ onNavigate }: { onNavigate: () => void }) {
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
      <Link className="navigation-user-card" href={"/login" as Route} onClick={onNavigate}>
        <span className="navigation-user-avatar" aria-hidden="true"><LogIn size={17} /></span>
        <span><strong>Войти в PGS</strong><small>Открыть рабочий контур</small></span>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className="navigation-user-card">
      <span className="navigation-user-avatar" aria-hidden="true">{userInitials(user.name)}</span>
      <span><strong>{user.name}</strong><small>{user.role}</small></span>
      <button aria-label="Выйти из PGS" disabled={loggingOut} onClick={() => void logout()} title="Выйти" type="button">
        <LogOut size={16} />
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
        // Navigation remains usable while auth or the database is unavailable.
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
    <Link aria-label={unread ? `Согласования: ${unread} непрочитанных` : "Согласования"} className="icon-button inbox-bell" href={"/inbox" as Route} title="Согласования">
      <Bell size={18} />
      {unread > 0 && <span className="inbox-bell-count">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}

export function AppNav({ children }: { children: ReactNode }) {
  const sheetId = useId();
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projectNavigationHost, setProjectNavigationHost] = useState<HTMLDivElement | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const lastOpener = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const activeItem = APP_NAVIGATION_ITEMS.find((item) => isNavigationItemActive(pathname, item));
  const isStandaloneSurface = isStandaloneAppSurface(pathname);

  const closeNavigation = useCallback((restoreFocus = true) => {
    setNavigationOpen(false);
    setQuery("");
    if (restoreFocus) requestAnimationFrame(() => {
      const opener = lastOpener.current;
      const target = opener?.isConnected && !opener.closest("[inert]") ? opener : menuButton.current;
      target?.focus({ preventScroll: true });
    });
  }, []);

  const openNavigation = useCallback((opener?: HTMLElement | null) => {
    if (sheetRef.current) {
      searchInput.current?.focus();
      return;
    }
    lastOpener.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : menuButton.current);
    window.dispatchEvent(new Event("pgs:global-navigation-open"));
    setNavigationOpen(true);
  }, []);

  useEffect(() => {
    closeNavigation(false);
  }, [closeNavigation, pathname]);

  useEffect(() => {
    function openCommand(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        if (isStandaloneSurface) return;
        const otherDialog = document.querySelector('[aria-modal="true"]:not(.navigation-sheet):not(.project-atlas-mega)');
        if (otherDialog) return;
        event.preventDefault();
        openNavigation();
      }
    }
    window.addEventListener("keydown", openCommand);
    return () => window.removeEventListener("keydown", openCommand);
  }, [isStandaloneSurface, openNavigation]);

  useEffect(() => {
    const closeForProjectNavigation = () => closeNavigation(false);
    window.addEventListener("pgs:project-navigation-open", closeForProjectNavigation);
    return () => window.removeEventListener("pgs:project-navigation-open", closeForProjectNavigation);
  }, [closeNavigation]);

  useEffect(() => {
    if (!navigationOpen) return;
    const focusFrame = requestAnimationFrame(() => searchInput.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const inertElements: Array<{ element: HTMLElement; previous: boolean }> = [];
    let branch: HTMLElement | null = sheetRef.current;
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement && !sibling.classList.contains("navigation-backdrop")) {
          inertElements.push({ element: sibling, previous: sibling.inert });
          sibling.inert = true;
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigation();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      inertElements.forEach(({ element, previous }) => { element.inert = previous; });
      document.body.style.overflow = previousOverflow;
    };
  }, [closeNavigation, navigationOpen]);

  if (isStandaloneSurface) {
    return <div className="auth-shell"><PwaRegister />{children}</div>;
  }

  return (
    <ProjectNavigationHostContext.Provider value={projectNavigationHost}>
    <div className="app-shell">
      <PwaRegister />
      <div className="app-main">
        <header className="topbar">
          <button
            aria-controls={sheetId}
            aria-expanded={navigationOpen}
            aria-haspopup="dialog"
            aria-label="Открыть меню PGS"
            className="atlas-brand atlas-workspace-trigger"
            onClick={(event) => navigationOpen ? closeNavigation() : openNavigation(event.currentTarget)}
            ref={menuButton}
            title="Главная, портфель и проекты"
            type="button"
          >
            <BrandWordmark decorative />
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <span className="topbar-page-context">{activeItem?.label ?? "Рабочая область"}</span>
          <div className="topbar-project-slot" ref={setProjectNavigationHost} />
          <button aria-label="Поиск по PGS" className="command-trigger" onClick={(event) => openNavigation(event.currentTarget)} title="Поиск по PGS · ⌘ K / Ctrl K" type="button">
            <Search size={17} aria-hidden="true" />
          </button>
          <div className="topbar-actions">
            <SystemStatusIndicator />
            <InboxBell />
            <Link className="button primary" href="/projects#create-project" title="Создать проект">
              <Plus size={17} aria-hidden="true" />
              <span>Создать</span>
            </Link>
          </div>
        </header>
        {children}
      </div>

      {navigationOpen ? (
        <>
          <button aria-label="Закрыть навигацию" className="navigation-backdrop" onClick={() => closeNavigation()} type="button" />
          <aside aria-label="Навигация PGS" aria-modal="true" className="navigation-sheet" id={sheetId} ref={sheetRef} role="dialog">
            <header className="navigation-sheet-header">
              <div><small>PGS Project Atlas</small><strong>Рабочее пространство</strong></div>
              <button aria-label="Закрыть навигацию" className="icon-button" onClick={() => closeNavigation()} title="Закрыть" type="button">
                <X size={18} />
              </button>
            </header>
            <NavigationSearch inputRef={searchInput} onChange={setQuery} onClear={() => setQuery("")} value={query} />
            <NavigationLinks onClearQuery={() => setQuery("")} onNavigate={() => closeNavigation(false)} query={query} />
            <Link className="navigation-create-link" href={"/projects#create-project" as Route} onClick={() => closeNavigation(false)}>
              <span aria-hidden="true"><Plus size={18} /></span>
              <div><strong>Новый проект</strong><small>Создание, Excel и стартовые документы</small></div>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
            <footer className="navigation-sheet-footer">
              <div className="navigation-sheet-version"><Command size={15} /><span>PGS Studio · операционный контур</span></div>
              <SidebarUserCard onNavigate={() => closeNavigation(false)} />
            </footer>
          </aside>
        </>
      ) : null}
    </div>
    </ProjectNavigationHostContext.Provider>
  );
}
