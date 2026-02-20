"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

interface AppShellProps {
  children: ReactNode;
  userEmail: string | null;
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isMarketingPage = pathname === "/" || pathname === "/landing";

  if (isAuthPage || isMarketingPage) {
    return <main className="page-wrap">{children}</main>;
  }

  return (
    <div className="app-shell-layout">
      <AppSidebar userEmail={userEmail} />
      <div className="min-w-0">
        <AppTopbar userEmail={userEmail} />
        <main className="page-wrap">{children}</main>
      </div>
    </div>
  );
}
