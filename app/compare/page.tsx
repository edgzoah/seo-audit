import Link from "next/link";
import type { ReactElement } from "react";

import { AuditPanel } from "../../components/AuditPanel";
import { CategoryDeltaChart } from "../../components/charts/CategoryDeltaChart";
import { IssueChangeChart } from "../../components/charts/IssueChangeChart";
import { IssueSeverityMixChart } from "../../components/charts/IssueSeverityMixChart";
import type {
  CategoryDeltaDatum,
  IssueChangeDatum,
  IssueSeverityMixDatum,
} from "../../components/charts/types";
import { CompareRunMenu } from "../../components/common/CompareRunMenu";
import { CompareSummary } from "../../components/domain/CompareSummary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { getDiff, getRunById, listDiffCandidates } from "../../lib/audits/repo";
import { requireUser } from "../../lib/auth/session";
import type { DiffReport } from "../../lib/audits/types";
import { humanize } from "../lib/format";

export const dynamic = "force-dynamic";

type Category = string;
type ScoreMap = Record<Category, number>;

interface ComparePageProps {
  searchParams?: Promise<{
    baseline?: string;
    current?: string;
  }>;
}

function toCategoryDeltaData(
  baselineScore: ScoreMap,
  currentScore: ScoreMap,
  limit = 8,
): CategoryDeltaDatum[] {
  const categoryKeys = new Set<string>([
    ...Object.keys(baselineScore),
    ...Object.keys(currentScore),
  ]);

  return Array.from(categoryKeys)
    .map((category) => {
      const baseline = baselineScore[category] ?? 0;
      const current = currentScore[category] ?? 0;
      return {
        category: humanize(category),
        baseline,
        current,
        delta: current - baseline,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

function toIssueChangeData(diff: DiffReport): IssueChangeDatum[] {
  return [
    { key: "resolved", label: "Resolved", value: diff.resolved_issues.length },
    { key: "new", label: "New", value: diff.new_issues.length },
    { key: "regressed", label: "Regressed", value: diff.regressed_issues.length },
  ];
}

function toIssueSeverityMixData(diff: DiffReport): IssueSeverityMixDatum[] {
  const counts: Record<IssueSeverityMixDatum["severity"], number> = {
    error: 0,
    warning: 0,
    notice: 0,
  };

  for (const issue of diff.regressed_issues) {
    counts[issue.current_max_severity] += 1;
  }

  return (Object.keys(counts) as IssueSeverityMixDatum["severity"][])
    .map((severity) => ({
      severity,
      count: counts[severity],
    }))
    .filter((item) => item.count > 0);
}

function getInitialSelection(candidates: string[], baseline?: string, current?: string): { baseline: string; current: string } {
  const fallbackCurrent = current && candidates.includes(current) ? current : candidates[0];
  const fallbackBaseline = baseline && candidates.includes(baseline) ? baseline : candidates.find((c) => c !== fallbackCurrent) ?? fallbackCurrent;
  return { baseline: fallbackBaseline, current: fallbackCurrent };
}

function issueList(title: string, items: string[]): ReactElement {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{items.length} items</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="grid gap-1 text-sm">
            {items.slice(0, 30).map((item) => (
              <li key={item} className="rounded-md border bg-muted/40 px-2 py-1">{humanize(item)}</li>
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
      <CardHeader className="pb-3">
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
                  <TableCell className="capitalize">{row.baseline_max_severity} → {row.current_max_severity}</TableCell>
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
  const user = await requireUser();
  const query = searchParams ? await searchParams : undefined;
  const candidates = await listDiffCandidates(user.userId);

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
  const diff = await getDiff(user.userId, selected.baseline, selected.current);
  if (!diff) {
    return <p className="text-sm text-muted-foreground">Could not build diff for selected runs.</p>;
  }

  const [baselineRun, currentRun] = await Promise.all([
    getRunById(user.userId, selected.baseline),
    getRunById(user.userId, selected.current),
  ]);

  if (!baselineRun || !currentRun) {
    return <p className="text-sm text-muted-foreground">Could not load reports for selected runs.</p>;
  }

  const categoryDeltaData = toCategoryDeltaData(
    baselineRun.summary.score_by_category,
    currentRun.summary.score_by_category,
  );
  const issueChangeData = toIssueChangeData(diff);
  const issueSeverityMixData = toIssueSeverityMixData(diff);

  return (
    <div className="space-y-6">
      <AuditPanel.Root>
        <AuditPanel.Header
          title="Compare Audit Runs"
          meta={<span className="text-xs text-muted-foreground">Baseline: {selected.baseline} • Current: {selected.current}</span>}
        />
        <AuditPanel.Body>
          <div className="flex flex-wrap gap-2">
            <CompareRunMenu label="Baseline" runIds={candidates} value={selected.baseline} />
            <CompareRunMenu label="Current" runIds={candidates} value={selected.current} />
          </div>
        </AuditPanel.Body>
      </AuditPanel.Root>

      <CompareSummary diff={diff} />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Category Score Delta</CardTitle>
            <CardDescription>
              Top categories sorted by absolute score change. Positive bars indicate improvement in the current run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryDeltaChart data={categoryDeltaData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Issue Change Summary</CardTitle>
            <CardDescription>Resolved, new, and regressed issue counts for the selected pair of runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <IssueChangeChart data={issueChangeData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Regression Severity Mix</CardTitle>
            <CardDescription>Distribution of regressed issues by current severity level.</CardDescription>
          </CardHeader>
          <CardContent>
            <IssueSeverityMixChart data={issueSeverityMixData} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {issueList("Resolved Issues", diff.resolved_issues)}
        {issueList("New Issues", diff.new_issues)}
      </section>

      {regressions(diff)}
    </div>
  );
}
