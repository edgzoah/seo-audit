import type { ReactNode } from "react";

import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell-layout">
      <AppSidebar />
      <div className="min-w-0">
        <AppTopbar />
        <main className="page-wrap">{children}</main>
      </div>
    </div>
  );
}
