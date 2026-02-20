"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { signOut } from "next-auth/react";

import { appNavItems } from "./nav";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";

function formatCrumb(pathname: string): string {
  if (pathname === "/") {
    return "Landing";
  }

  if (pathname === "/dashboard") {
    return "Dashboard";
  }

  return pathname
    .split("/")
    .filter(Boolean)
    .map((chunk) => (chunk.startsWith("run-") ? "Run Detail" : chunk.charAt(0).toUpperCase() + chunk.slice(1)))
    .join(" / ");
}

interface AppTopbarProps {
  userEmail: string | null;
}

export function AppTopbar({ userEmail }: AppTopbarProps) {
  const pathname = usePathname();
  const crumb = formatCrumb(pathname);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle>SEO Audit</SheetTitle>
              </SheetHeader>
              <nav className="grid gap-1 p-3">
                {appNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
          <p className="text-sm font-medium text-muted-foreground">{crumb}</p>
        </div>

        <div className="flex items-center gap-2">
          {userEmail ? <p className="text-xs text-muted-foreground">{userEmail}</p> : null}
          {userEmail ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link href="/compare">Open Compare</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/new">New Audit</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Logout
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
