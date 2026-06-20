import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
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
            <Link className="brand" href="/dashboard">
              <span className="brand-mark">
                <Building2 size={20} />
              </span>
              <span>PGS Construction</span>
            </Link>
            <nav className="nav">
              <Link href="/dashboard">Дашборд</Link>
              <Link href="/projects">Проекты</Link>
              <Link href="/projects/project-demo">Демо объект</Link>
              <Link href="/admin/users">Пользователи</Link>
              <Link href="/admin/integrations">Интеграции</Link>
              <Link href="/login">Вход</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
