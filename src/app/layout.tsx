import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "任意门 / Anywhere Door" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
