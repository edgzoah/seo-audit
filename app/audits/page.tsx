import Link from "next/link";

import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { AuditsFilterBar } from "../../components/domain/AuditsFilterBar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { listRunsPage, type RunCoverageFilter, type RunSeverityFilter, type RunSort, type RunStatusFilter, type RunSummary } from "../../lib/audits/repo";
import { compactUrl, formatPercent } from "../lib/format";

export const dynamic = "force-dynamic";

type AuditRow = RunSummary;
type AuditStatus = "healthy" | "watch" | "critical";

type StatusFilter = RunStatusFilter;
type SeverityFilter = RunSeverityFilter;
type CoverageFilter = RunCoverageFilter;
type SortFilter = RunSort;

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
    page?: string;
    pageSize?: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 25;

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

function normalizePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function normalizePageSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? String(DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(100, parsed);
}

function statusBadge(status: AuditStatus): "success" | "warning" | "danger" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "danger";
}

function buildPageHref(input: {
  status: StatusFilter;
  severity: SeverityFilter;
  coverage: CoverageFilter;
  sort: SortFilter;
  domain: string;
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  if (input.status !== "all") params.set("status", input.status);
  if (input.severity !== "all") params.set("severity", input.severity);
  if (input.coverage !== "all") params.set("coverage", input.coverage);
  if (input.sort !== "newest") params.set("sort", input.sort);
  if (input.domain.length > 0) params.set("domain", input.domain);
  if (input.page > 1) params.set("page", String(input.page));
  if (input.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(input.pageSize));

  const query = params.toString();
  return query.length > 0 ? `/audits?${query}` : "/audits";
}

export default async function AuditsPage({ searchParams }: AuditsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const statusFilter = normalizeStatus(params?.status);
  const severityFilter = normalizeSeverity(params?.severity);
  const coverageFilter = normalizeCoverage(params?.coverage);
  const sortFilter = normalizeSort(params?.sort);
  const page = normalizePage(params?.page);
  const pageSize = normalizePageSize(params?.pageSize);
  const domainFilter = (params?.domain ?? "").trim();

  const pageResult = await listRunsPage({
    page,
    pageSize,
    status: statusFilter,
    severity: severityFilter,
    coverage: coverageFilter,
    domain: domainFilter.length > 0 ? domainFilter : undefined,
    sort: sortFilter,
  });

  const rows = pageResult.items.map((run): AuditListRow => ({
    ...run,
    domain: getDomain(run.inputs.target),
    status: getStatus(run),
  }));

  const totalPages = Math.max(1, Math.ceil(pageResult.total / pageResult.pageSize));
  const hasPreviousPage = pageResult.page > 1;
  const hasNextPage = pageResult.page < totalPages;

  const columns: DataTableColumn<AuditListRow>[] = [
    {
      key: "run",
      header: "Run",
      render: (row) => (
        <div className="space-y-0.5">
          <Link href={`/audits/${row.run_id}`} className="font-medium text-primary hover:underline">
            {row.display_name ?? row.run_id}
          </Link>
          {row.display_name ? <p className="text-xs text-muted-foreground">{row.run_id}</p> : null}
        </div>
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
          <CardDescription>Server-side filtered and paginated run snapshots.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Matching Runs</p>
            <p className="mt-1 text-2xl font-semibold">{pageResult.total}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Page</p>
            <p className="mt-1 text-2xl font-semibold">
              {pageResult.page} / {totalPages}
            </p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Actions</p>
            <p className="mt-1 text-sm">
              <Link className="text-primary hover:underline" href="/new">
                Create a new audit run
              </Link>
            </p>
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
            domains={[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs Table</CardTitle>
          <CardDescription>
            Showing {rows.length} of {pageResult.total} rows
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable columns={columns} rows={rows} getRowKey={(row) => row.run_id} emptyLabel="No runs match filters." />
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button asChild variant="outline" size="sm" disabled={!hasPreviousPage}>
              <Link
                href={
                  hasPreviousPage
                    ? buildPageHref({
                        status: statusFilter,
                        severity: severityFilter,
                        coverage: coverageFilter,
                        sort: sortFilter,
                        domain: domainFilter,
                        page: pageResult.page - 1,
                        pageSize: pageResult.pageSize,
                      })
                    : "#"
                }
                aria-disabled={!hasPreviousPage}
              >
                Previous
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">Page size: {pageResult.pageSize}</p>
            <Button asChild variant="outline" size="sm" disabled={!hasNextPage}>
              <Link
                href={
                  hasNextPage
                    ? buildPageHref({
                        status: statusFilter,
                        severity: severityFilter,
                        coverage: coverageFilter,
                        sort: sortFilter,
                        domain: domainFilter,
                        page: pageResult.page + 1,
                        pageSize: pageResult.pageSize,
                      })
                    : "#"
                }
                aria-disabled={!hasNextPage}
              >
                Next
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
