import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Database,
  Gauge,
  GitCompare,
  LayoutDashboard,
  ListChecks,
  Shield,
  Workflow,
} from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

const features = [
  {
    title: "Automated SEO QA",
    description: "Run consistent audits before every release and catch regressions before they hit production.",
    icon: Gauge,
  },
  {
    title: "Owner-Isolated Workspaces",
    description: "Each account sees only its own runs, diffs, and job statuses.",
    icon: Shield,
  },
  {
    title: "Diff-First Monitoring",
    description: "Compare baseline vs current with category deltas and issue severity distribution.",
    icon: BarChart3,
  },
  {
    title: "Operational Workflow",
    description: "Launch audits, monitor progress, and triage issues from a single dashboard.",
    icon: Workflow,
  },
];

const planItems = [
  "Audit scheduler ready flow",
  "Run compare with regression visibility",
  "Role-ready multi-user ownership model",
  "reCAPTCHA-protected auth and run execution",
];

const modules = [
  {
    title: "Dashboard",
    description: "Central view for recent runs, KPI cards, and quick actions for daily SEO operations.",
    icon: LayoutDashboard,
  },
  {
    title: "Audits",
    description: "Run list with filtering and drill-down into issues, categories, severities, and evidence.",
    icon: ListChecks,
  },
  {
    title: "Compare",
    description: "Baseline vs current comparison with category deltas and regression-oriented charts.",
    icon: GitCompare,
  },
];

const stack = [
  "Next.js App Router + TypeScript",
  "Prisma + PostgreSQL for persistent runs/jobs",
  "NextAuth (credentials + Google) with owner isolation",
  "RHF + Zod + reCAPTCHA validation flows",
  "shadcn/ui + Recharts for operational UI",
];

export default function LandingPage() {
  return (
    <div className="space-y-10 pb-14 pt-6">
      <section className="relative overflow-hidden rounded-3xl border bg-card p-8 md:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_35%)]" />
        <div className="relative z-10 max-w-4xl space-y-5">
          <Badge variant="outline">SEO Operations App</Badge>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            SEO Audit Control Center
          </h1>
          <p className="max-w-3xl text-base text-muted-foreground md:text-lg">
            A focused web application for running deterministic SEO audits, tracking findings by severity and category,
            and comparing runs to spot regressions quickly.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">Open Dashboard</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/new">Run New Audit</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card key={feature.title} className="subtle-enter hover:-translate-y-0.5">
              <CardHeader className="space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/50">
                  <Icon className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">{feature.description}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="grid-bg">
          <CardHeader>
            <CardTitle>Built for Delivery Teams</CardTitle>
            <CardDescription>
              From release validation to SEO health baselines, the platform is designed for operational execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {planItems.map((item) => (
              <p key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <span>{item}</span>
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Core Workflow</CardTitle>
            <CardDescription>How the app is used in practice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>1. Launch audit for target domain</li>
              <li>2. Track job progress and generated artifacts</li>
              <li>3. Review issues and prioritize fixes</li>
              <li>4. Compare runs against a baseline</li>
            </ul>
            <Button asChild className="w-full">
              <Link href="/compare">Open Compare View</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Card key={module.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4" />
                  {module.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{module.description}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              Technical Stack
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {stack.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(14,165,233,0.08),transparent_45%,rgba(16,185,129,0.08))]" />
          <CardHeader className="relative">
            <CardTitle className="text-base">Why this interface is practical</CardTitle>
            <CardDescription>
              The design focuses on operational clarity: fast scanning, clear priorities, and deterministic outputs.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative grid gap-3 text-sm text-muted-foreground">
            <p>Issue severity, counts, and affected URLs are visible without extra navigation depth.</p>
            <p>Comparison mode is optimized for “what changed” instead of generic historical browsing.</p>
            <p>Owner-scoped data access ensures each account works on isolated audit datasets.</p>
            <p>Form flow keeps validation strict while maintaining short path from input to run execution.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
