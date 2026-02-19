import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Audit Control Center",
  description: "Enterprise SEO audit dashboard in Next.js",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
