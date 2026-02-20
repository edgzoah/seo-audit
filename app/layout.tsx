import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell/AppShell";
import { getOptionalUser } from "../lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Audit Control Center",
  description: "Enterprise SEO audit dashboard in Next.js",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getOptionalUser();

  return (
    <html lang="en">
      <body>
        <AppShell userEmail={user?.email ?? null}>{children}</AppShell>
      </body>
    </html>
  );
}
