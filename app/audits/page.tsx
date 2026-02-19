import Link from "next/link";

import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { AuditsFilterBar } from "../../components/domain/AuditsFilterBar";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { listRuns } from "../../lib/audits/fs";
import type { Report } from "../../lib/audits/types";
import { compactUrl, formatPercent } from "../lib/format";

type AuditRow = Pick<Report, "run_id" | "started_at" | "summary" | "inputs">;
type AuditStatus = "healthy" | "watch" | "critical";
type StatusFilter = "all" | AuditStatus;
type SeverityFilter = "all" | "error" | "warning" | "notice";
type CoverageFilter = "all" | Report["inputs"]["coverage"];
type SortFilter = "newest" | "oldest" | "score_desc" | "score_asc" | "pages_desc" | "warnings_desc";

interface AuditListRow extends AuditRow {
  domain: string | null;
  status: AuditStatus;
}

interface AuditsPageProps {
  searchParams?: Promise<{
    status?: string;
    severity?: string;
    coverage?: string;
    domain?: string;
    sort?: string;
  }>;
}

function getStatus(row: AuditRow): AuditStatus {
  if (row.summary.errors > 0) return "critical";
  if (row.summary.warnings > 0) return "watch";
  return "healthy";
}

function getDomain(target: string): string | null {
  try {
    return new URL(target).hostname;
  } catch {
    return null;
  }
}

function normalizeStatus(value: string | undefined): StatusFilter {
  if (value === "healthy" || value === "watch" || value === "critical") return value;
  return "all";
}

function normalizeSeverity(value: string | undefined): SeverityFilter {
  if (value === "error" || value === "warning" || value === "notice") return value;
  return "all";
}

function normalizeCoverage(value: string | undefined): CoverageFilter {
  if (value === "quick" || value === "surface" || value === "full") return value;
  return "all";
}

function normalizeSort(value: string | undefined): SortFilter {
  if (value === "oldest" || value === "score_desc" || value === "score_asc" || value === "pages_desc" || value === "warnings_desc") {
    return value;
  }
  return "newest";
}

function isRowMatchingSeverity(row: AuditListRow, severity: SeverityFilter): boolean {
  if (severity === "all") return true;
  if (severity === "error") return row.summary.errors > 0;
  if (severity === "warning") return row.summary.warnings > 0;
  return row.summary.notices > 0;
}

function sortRows(rows: AuditListRow[], sort: SortFilter): AuditListRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "oldest") return a.started_at.localeCompare(b.started_at);
    if (sort === "score_desc") return b.summary.score_total - a.summary.score_total;
    if (sort === "score_asc") return a.summary.score_total - b.summary.score_total;
    if (sort === "pages_desc") return b.summary.pages_crawled - a.summary.pages_crawled;
    if (sort === "warnings_desc") return b.summary.warnings - a.summary.warnings;
    return b.started_at.localeCompare(a.started_at);
  });
  return copy;
}

function statusBadge(status: AuditStatus): "success" | "warning" | "danger" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "danger";
}

export default async function AuditsPage({ searchParams }: AuditsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const statusFilter = normalizeStatus(params?.status);
  const severityFilter = normalizeSeverity(params?.severity);
  const coverageFilter = normalizeCoverage(params?.coverage);
  const sortFilter = normalizeSort(params?.sort);
  const domainFilter = params?.domain ?? "all";

  const rows = (await listRuns(300)).map((run): AuditListRow => ({
    ...run,
    domain: getDomain(run.inputs.target),
    status: getStatus(run),
  }));

  const domains = Array.from(new Set(rows.map((row) => row.domain).filter((row): row is string => row !== null))).sort((a, b) =>
    a.localeCompare(b),
  );

  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (coverageFilter !== "all" && row.inputs.coverage !== coverageFilter) return false;
    if (domainFilter !== "all" && row.domain !== domainFilter) return false;
    return isRowMatchingSeverity(row, severityFilter);
  });

  const sortedRows = sortRows(filteredRows, sortFilter);

  const columns: DataTableColumn<AuditListRow>[] = [
    {
      key: "run",
      header: "Run",
      render: (row) => (
        <Link href={`/audits/${row.run_id}`} className="font-medium text-primary hover:underline">
          {row.run_id}
        </Link>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (row) => (
        <span title={row.inputs.target}>
          {compactUrl(row.inputs.target)}
          <br />
          <span className="text-xs text-muted-foreground">{row.domain ?? "n/a"}</span>
        </span>
      ),
    },
    {
      key: "coverage",
      header: "Coverage",
      render: (row) => <Badge variant="outline">{row.inputs.coverage}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={statusBadge(row.status)}>{row.status}</Badge>,
    },
    {
      key: "score",
      header: "Score",
      render: (row) => formatPercent(row.summary.score_total),
    },
    {
      key: "pages",
      header: "Pages",
      render: (row) => row.summary.pages_crawled,
    },
    {
      key: "sev",
      header: "Severity",
      render: (row) => `${row.summary.errors} / ${row.summary.warnings} / ${row.summary.notices}`,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="grid-bg">
        <CardHeader>
          <CardTitle>Audit Runs</CardTitle>
          <CardDescription>Filter and sort deterministic run snapshots.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Runs</p>
            <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Filtered</p>
            <p className="mt-1 text-2xl font-semibold">{sortedRows.length}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Actions</p>
            <p className="mt-1 text-sm"><Link className="text-primary hover:underline" href="/new">Create a new audit run</Link></p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditsFilterBar
            defaults={{
              status: statusFilter,
              severity: severityFilter,
              coverage: coverageFilter,
              domain: domainFilter,
              sort: sortFilter,
            }}
            domains={domains}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs Table</CardTitle>
          <CardDescription>{sortedRows.length} rows</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={sortedRows} getRowKey={(row) => row.run_id} emptyLabel="No runs match filters." />
        </CardContent>
      </Card>
    </div>
  );
}
