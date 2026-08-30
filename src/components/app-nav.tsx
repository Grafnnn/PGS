"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  Command,
  Gauge,
  Layers3,
  LogIn,
  LogOut,
  Menu,
  Plug,
  Plus,
  Search,
  Users,
  X
} from "lucide-react";
import { type ReactNode, type RefObject, useCallback, useEffect, useId, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { PwaRegister } from "@/components/pwa-register";
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
        placeholder="Раздел или действие"
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

function NavigationRail({ onOpen }: { onOpen: () => void }) {
  const pathname = usePathname();
  const workItems = APP_NAVIGATION_ITEMS.filter((item) => item.group === "Работа");
  const settingsItems = APP_NAVIGATION_ITEMS.filter((item) => item.group === "Настройки");

  const links = (items: AppNavigationItem[]) => items.map((item) => (
    <Link
      aria-current={isNavigationItemActive(pathname, item) ? "page" : undefined}
      className={isNavigationItemActive(pathname, item) ? "active" : undefined}
      href={item.href as Route}
      key={item.id}
      title={item.label}
    >
      {navigationIcons[item.id]}
      <span>{item.label}</span>
    </Link>
  ));

  return (
    <aside className="app-rail" aria-label="Быстрая навигация">
      <BrandLogo compact />
      <button aria-label="Открыть все разделы" className="rail-menu-button" onClick={onOpen} title="Все разделы" type="button">
        <Menu size={20} />
      </button>
      <Link className="rail-create-button" href={"/projects#create-project" as Route} title="Новый проект">
        <Plus size={20} />
        <span>Создать</span>
      </Link>
      <nav className="rail-links" aria-label="Рабочие разделы">{links(workItems)}</nav>
      <nav className="rail-links rail-links-bottom" aria-label="Системные разделы">{links(settingsItems)}</nav>
    </aside>
  );
}

export function AppNav({ children }: { children: ReactNode }) {
  const sheetId = useId();
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const activeItem = APP_NAVIGATION_ITEMS.find((item) => isNavigationItemActive(pathname, item));
  const isStandaloneSurface = isStandaloneAppSurface(pathname);

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    setQuery("");
  }, []);

  const openNavigation = useCallback(() => {
    setNavigationOpen(true);
  }, []);

  useEffect(() => {
    closeNavigation();
  }, [closeNavigation, pathname]);

  useEffect(() => {
    function openCommand(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        openNavigation();
      }
    }
    window.addEventListener("keydown", openCommand);
    return () => window.removeEventListener("keydown", openCommand);
  }, [openNavigation]);

  useEffect(() => {
    if (!navigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => searchInput.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigation();
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])"));
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [closeNavigation, navigationOpen]);

  if (isStandaloneSurface) {
    return <div className="auth-shell"><PwaRegister />{children}</div>;
  }

  return (
    <div className="app-shell">
      <PwaRegister />
      <NavigationRail onOpen={openNavigation} />

      <div className="app-main">
        <header className="topbar">
          <button
            aria-controls={sheetId}
            aria-expanded={navigationOpen}
            aria-label="Открыть навигацию"
            className="icon-button topbar-menu-button"
            onClick={openNavigation}
            ref={menuButton}
            type="button"
          >
            <Menu size={19} />
          </button>
          <div className="topbar-route">
            <span>PGS Studio</span>
            <ChevronRight size={13} aria-hidden="true" />
            <strong>{activeItem?.label ?? "Рабочая область"}</strong>
          </div>
          <button className="command-trigger" onClick={openNavigation} type="button">
            <Search size={17} aria-hidden="true" />
            <span>Быстрый переход</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <span className="topbar-context"><i /> Система в норме</span>
            <InboxBell />
            <Link className="button primary" href="/projects#create-project" title="Создать проект">
              <Plus size={17} />
              <span>Создать</span>
            </Link>
          </div>
        </header>
        {children}
      </div>

      {navigationOpen ? (
        <>
          <button aria-label="Закрыть навигацию" className="navigation-backdrop" onClick={closeNavigation} type="button" />
          <aside aria-label="Навигация PGS" className="navigation-sheet" id={sheetId} ref={sheetRef}>
            <header className="navigation-sheet-header">
              <BrandLogo />
              <button aria-label="Закрыть навигацию" className="icon-button" onClick={closeNavigation} title="Закрыть" type="button">
                <X size={18} />
              </button>
            </header>
            <Link className="navigation-create-link" href={"/projects#create-project" as Route} onClick={closeNavigation}>
              <span><Plus size={18} /></span>
              <div><strong>Новый проект</strong><small>Создание, Excel и стартовые документы</small></div>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
            <NavigationSearch inputRef={searchInput} onChange={setQuery} onClear={() => setQuery("")} value={query} />
            <NavigationLinks onClearQuery={() => setQuery("")} onNavigate={closeNavigation} query={query} />
            <footer className="navigation-sheet-footer">
              <div className="navigation-sheet-version"><Command size={15} /><span>PGS Studio · операционный контур</span></div>
              <SidebarUserCard onNavigate={closeNavigation} />
            </footer>
          </aside>
        </>
      ) : null}
    </div>
  );
}
