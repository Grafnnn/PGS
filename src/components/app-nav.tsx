"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  match?: string[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", match: ["/dashboard"] },
  { href: "/projects", label: "Проекты", match: ["/projects"] },
  { href: "/projects/project-demo", label: "Бюджет / ВОР" },
  { href: "/projects/project-demo", label: "График" },
  { href: "/projects/project-demo", label: "Материалы" },
  { href: "/projects/project-demo", label: "Заявки" },
  { href: "/projects/project-demo", label: "Риски" },
  { href: "/projects/project-demo", label: "AI" },
  { href: "/admin/users", label: "Пользователи", match: ["/admin"] }
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Основная навигация">
      {navItems.map((item) => {
        const active = item.match?.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ?? false;
        return (
          <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={item.href as Route} key={`${item.label}-${item.href}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
