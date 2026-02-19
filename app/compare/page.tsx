import Link from "next/link";
import type { ReactElement } from "react";

import { AuditPanel } from "../../components/AuditPanel";
import { ScoreDeltaChart } from "../../components/charts/ScoreDeltaChart";
import { CompareLegendPopover } from "../../components/common/CompareLegendPopover";
import { CompareRunMenu } from "../../components/common/CompareRunMenu";
import { CompareSummary } from "../../components/domain/CompareSummary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { getDiff, listDiffCandidates } from "../../lib/audits/repo";
import type { DiffReport } from "../../lib/audits/types";
import { humanize } from "../lib/format";

export const dynamic = "force-dynamic";

type Category = string;
type ScoreDeltaMap = Record<Category, number>;

interface ComparePageProps {
  searchParams?: Promise<{
    baseline?: string;
    current?: string;
  }>;
}

function toChartData(scoreByCategory: ScoreDeltaMap): { category: string; delta: number }[] {
  return Object.entries(scoreByCategory)
    .map(([category, delta]) => ({ category: humanize(category), delta }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function getInitialSelection(candidates: string[], baseline?: string, current?: string): { baseline: string; current: string } {
  const fallbackCurrent = current && candidates.includes(current) ? current : candidates[0];
  const fallbackBaseline = baseline && candidates.includes(baseline) ? baseline : candidates.find((c) => c !== fallbackCurrent) ?? fallbackCurrent;
  return { baseline: fallbackBaseline, current: fallbackCurrent };
}

function issueList(title: string, items: string[]): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{items.length} items</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="grid gap-1 text-sm">
            {items.slice(0, 30).map((item) => (
              <li key={item} className="rounded-md bg-muted/60 px-2 py-1">{humanize(item)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No items.</p>
        )}
      </CardContent>
    </Card>
  );
}

function regressions(diff: DiffReport): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regressed Issues</CardTitle>
        <CardDescription>{diff.regressed_issues.length} rows</CardDescription>
      </CardHeader>
      <CardContent>
        {diff.regressed_issues.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diff.regressed_issues.slice(0, 30).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{humanize(row.id)}</TableCell>
                  <TableCell>{row.baseline_count} → {row.current_count}</TableCell>
                  <TableCell>{row.baseline_max_severity} → {row.current_max_severity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No regressions.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const query = searchParams ? await searchParams : undefined;
  const candidates = await listDiffCandidates();

  if (candidates.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compare Runs</CardTitle>
          <CardDescription>At least two runs are required.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/audits" className="text-primary hover:underline">Go to audits</Link>
        </CardContent>
      </Card>
    );
  }

  const selected = getInitialSelection(candidates, query?.baseline, query?.current);
  const diff = await getDiff(selected.baseline, selected.current);
  if (!diff) {
    return <p className="text-sm text-muted-foreground">Could not build diff for selected runs.</p>;
  }

  const chartData = toChartData(diff.score_by_category_delta);

  return (
    <div className="space-y-6">
      <AuditPanel.Root>
        <AuditPanel.Header title="Compare Audit Runs" meta={<span className="text-xs text-muted-foreground">Baseline: {selected.baseline} • Current: {selected.current}</span>} />
        <AuditPanel.Body>
          <div className="flex flex-wrap gap-2">
            <CompareRunMenu label="Baseline" runIds={candidates} value={selected.baseline} />
            <CompareRunMenu label="Current" runIds={candidates} value={selected.current} />
          </div>
        </AuditPanel.Body>
      </AuditPanel.Root>

      <CompareSummary diff={diff} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Score Delta by Category</span>
            <CompareLegendPopover />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreDeltaChart data={chartData} />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        {issueList("Resolved Issues", diff.resolved_issues)}
        {issueList("New Issues", diff.new_issues)}
      </section>

      {regressions(diff)}
    </div>
  );
}
