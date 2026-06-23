"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Bot, BriefcaseBusiness, FileText, Gauge, Landmark, PackageCheck, ShieldAlert, SlidersHorizontal, Users } from "lucide-react";

type NavItem = {
  href: string;
  icon: React.ReactNode;
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

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="nav sidebar-nav" aria-label="Основная навигация">
      {navItems.map((item) => {
        const active = item.match?.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ?? false;
        return (
          <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={item.href as Route} key={`${item.label}-${item.href}`}>
            {item.icon}
            <span>
              <strong>{item.label}</strong>
              <small>{item.section}</small>
            </span>
          </Link>
        );
      })}
      <div className="sidebar-system-card">
        <SlidersHorizontal size={17} />
        <div>
          <strong>Контур v0.9</strong>
          <span>Бюджет · Сроки · Снабжение</span>
        </div>
      </div>
    </nav>
  );
}
