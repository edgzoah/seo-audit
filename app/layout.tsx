import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AppShell } from "../components/app-shell/AppShell";
import { getOptionalUser } from "../lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Audit Control Center",
  description: "Enterprise SEO audit dashboard in Next.js",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isMarketingPage = pathname === "/" || pathname === "/landing";
  const user = isAuthPage || isMarketingPage ? null : await getOptionalUser();

  return (
    <html lang="en">
      <body>
        <AppShell userEmail={user?.email ?? null}>{children}</AppShell>
      </body>
    </html>
  );
}
