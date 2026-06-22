import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "PGS Construction Platform",
  description: "MVP системы управления строительными проектами"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <BrandLogo />
            <nav className="nav">
              <Link href="/dashboard">Дашборд</Link>
              <Link href="/projects">Проекты</Link>
              <Link href="/projects/project-demo">Бюджет / ВОР</Link>
              <Link href="/projects/project-demo">График</Link>
              <Link href="/projects/project-demo">Материалы</Link>
              <Link href="/projects/project-demo">Заявки</Link>
              <Link href="/projects/project-demo">Риски</Link>
              <Link href="/projects/project-demo">AI</Link>
              <Link href="/admin/users">Пользователи</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
