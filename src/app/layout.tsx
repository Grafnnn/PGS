import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";
import "./design-v3.css";
import "./design-v5.css";
import "./design-v6.css";
import "./design-atelier.css";
import "./design-monolith.css";
import "./design-monolith-dashboard.css";
import "./design-monolith-menu.css";
import "./design-monolith-details.css";
import "./design-monolith-header.css";
import "./design-monolith-geometry.css";
import "./brand-identity.css";
import "./design-monolith-typography.css";
import "./design-monolith-system.css";
import "./design-monolith-workspaces.css";
import "./design-monolith-pages.css";
import "./design-monolith-semantic.css";

export const metadata: Metadata = {
  title: "PGS Studio",
  description: "Операционная система управления строительными проектами",
  applicationName: "PGS Studio",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = { themeColor: "#0b0d0e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="design-v5 design-v6 design-monolith" data-atlas-version="v6" data-design="v3">
        <AppNav>{children}</AppNav>
      </body>
    </html>
  );
}
