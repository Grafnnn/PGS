import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";
import "./design-v3.css";
import "./design-v5.css";

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
      <body className="design-v5" data-design="v3">
        <AppNav>{children}</AppNav>
      </body>
    </html>
  );
}
