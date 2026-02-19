"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { appNavItems } from "./nav";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar-glass hidden h-screen flex-col gap-4 p-4 md:flex">
      <div className="rounded-lg border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">SEO Audit</p>
        <p className="mt-1 text-sm font-semibold">B2B Operations Hub</p>
      </div>
      <nav className="grid gap-1">
        {appNavItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "subtle-enter flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                active && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {active ? <Badge variant="outline" className="ml-auto">Live</Badge> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
