import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "PGS Construction Platform",
  description: "MVP системы управления строительными проектами"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AppNav>{children}</AppNav>
      </body>
    </html>
  );
}
