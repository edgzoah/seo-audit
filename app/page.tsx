import Link from "next/link";
import { ArrowRight, LineChart, ShieldCheck } from "lucide-react";

import { listRunsPage } from "../lib/audits/repo";
import { RunKpiCards } from "../components/domain/RunKpiCards";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { formatPercent } from "./lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { items: runs } = await listRunsPage({ page: 1, pageSize: 20, sort: "newest" });
  const recent = runs[0];

  return (
    <div className="space-y-6">
      <section className="grid-bg relative overflow-hidden rounded-2xl border bg-card p-6 md:p-8">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/15 blur-2xl" aria-hidden />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-2">
            <Badge variant="outline">Enterprise SEO Operations</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">SEO Audit Command Center</h1>
            <p className="text-muted-foreground">
              Manage run quality, compare regressions, and launch new audits from a single B2B SaaS workspace.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/new">Start New Audit</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/compare">Compare Runs</Link>
            </Button>
          </div>
        </div>
      </section>

      {recent ? <RunKpiCards summary={recent.summary} /> : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" /> Reliability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Deterministic run artifacts with typed server data access layer.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><LineChart className="h-4 w-4" /> Observability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Comparison charts and issue deltas for release quality checks.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quick Actions</CardTitle>
            <CardDescription>Jump to main operational flows.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/audits">Open Audits</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/new">Create Run</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>{runs.length} items</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.run_id}>
                  <TableCell className="font-medium">{run.run_id}</TableCell>
                  <TableCell className="max-w-[300px] truncate" title={run.inputs.target}>{run.inputs.target}</TableCell>
                  <TableCell>{formatPercent(run.summary.score_total)}</TableCell>
                  <TableCell>{run.summary.pages_crawled}</TableCell>
                  <TableCell>{run.summary.warnings}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/audits/${run.run_id}`}>Open <ArrowRight className="h-4 w-4" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
