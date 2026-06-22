import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "浮生 / The Reveries" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
