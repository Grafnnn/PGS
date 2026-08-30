import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";
import "./design-v3.css";
import "./design-v4.css";

export const metadata: Metadata = {
  title: "PGS Studio",
  description: "Операционная система управления строительными проектами",
  applicationName: "PGS Studio",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = { themeColor: "#10181c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="design-v4" data-design="v3">
        <AppNav>{children}</AppNav>
      </body>
    </html>
  );
}
