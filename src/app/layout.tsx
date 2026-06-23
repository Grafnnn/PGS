import type { Metadata } from "next";
import { Bell, Plus, Search } from "lucide-react";
import { AppNav } from "@/components/app-nav";
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
          <aside className="sidebar">
            <BrandLogo />
            <AppNav />
          </aside>
          <div className="app-main">
            <header className="topbar">
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
        </div>
      </body>
    </html>
  );
}
