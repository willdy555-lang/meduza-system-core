import type { ReactNode } from "react";

export const metadata = {
  title: "MEDUZA SYSTEM",
  description: "Fleet, service and rental management system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f5f6f8" }}>
        {children}
      </body>
    </html>
  );
}
