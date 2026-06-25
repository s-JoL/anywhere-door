import "./globals.css";
import type { ReactNode } from "react";
import { HTML_LANG, LOCALE } from "@/lib/i18n/locale";

export const metadata = {
  title: LOCALE === "en" ? "Anywhere Door" : "任意门 / Anywhere Door",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={HTML_LANG}>
      <body>{children}</body>
    </html>
  );
}
