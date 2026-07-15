import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "PGS Construction Platform",
  description: "MVP системы управления строительными проектами",
  applicationName: "PGS",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = { themeColor: "#15181d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AppNav>{children}</AppNav>
      </body>
    </html>
  );
}
