import { BarChart3, Compass, LayoutDashboard, PlusCircle } from "lucide-react";

export const appNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/audits", label: "Audits", icon: Compass },
  { href: "/compare", label: "Compare", icon: BarChart3 },
  { href: "/new", label: "New Audit", icon: PlusCircle },
] as const;
