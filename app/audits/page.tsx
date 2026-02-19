import Link from "next/link";

import { DataTable, type DataTableColumn } from "../../components/DataTable";
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
  if (row.summary.errors > 0) {
    return "critical";
  }

  if (row.summary.warnings > 0) {
    return "watch";
  }

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
  if (value === "healthy" || value === "watch" || value === "critical") {
    return value;
  }

  return "all";
}

function normalizeSeverity(value: string | undefined): SeverityFilter {
  if (value === "error" || value === "warning" || value === "notice") {
    return value;
  }

  return "all";
}

function normalizeCoverage(value: string | undefined): CoverageFilter {
  if (value === "quick" || value === "surface" || value === "full") {
    return value;
  }

  return "all";
}

function normalizeSort(value: string | undefined): SortFilter {
  if (
    value === "oldest" ||
    value === "score_desc" ||
    value === "score_asc" ||
    value === "pages_desc" ||
    value === "warnings_desc"
  ) {
    return value;
  }

  return "newest";
}

function isRowMatchingSeverity(row: AuditListRow, severity: SeverityFilter): boolean {
  if (severity === "all") {
    return true;
  }

  if (severity === "error") {
    return row.summary.errors > 0;
  }

  if (severity === "warning") {
    return row.summary.warnings > 0;
  }

  return row.summary.notices > 0;
}

function sortRows(rows: AuditListRow[], sort: SortFilter): AuditListRow[] {
  const copy = [...rows];

  copy.sort((a, b) => {
    if (sort === "oldest") {
      return a.started_at.localeCompare(b.started_at);
    }

    if (sort === "score_desc") {
      return b.summary.score_total - a.summary.score_total;
    }

    if (sort === "score_asc") {
      return a.summary.score_total - b.summary.score_total;
    }

    if (sort === "pages_desc") {
      return b.summary.pages_crawled - a.summary.pages_crawled;
    }

    if (sort === "warnings_desc") {
      return b.summary.warnings - a.summary.warnings;
    }

    return b.started_at.localeCompare(a.started_at);
  });

  return copy;
}

export default async function AuditsPage({ searchParams }: AuditsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const statusFilter = normalizeStatus(params?.status);
  const severityFilter = normalizeSeverity(params?.severity);
  const coverageFilter = normalizeCoverage(params?.coverage);
  const sortFilter = normalizeSort(params?.sort);
  const domainFilter = params?.domain ?? "all";

  const rows = (await listRuns(200)).map((run): AuditListRow => ({
    ...run,
    domain: getDomain(run.inputs.target),
    status: getStatus(run),
  }));

  const domains = Array.from(new Set(rows.map((row) => row.domain).filter((row): row is string => row !== null))).sort(
    (a, b) => a.localeCompare(b),
  );

  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) {
      return false;
    }

    if (coverageFilter !== "all" && row.inputs.coverage !== coverageFilter) {
      return false;
    }

    if (domainFilter !== "all" && row.domain !== domainFilter) {
      return false;
    }

    return isRowMatchingSeverity(row, severityFilter);
  });

  const sortedRows = sortRows(filteredRows, sortFilter);
  const columns: DataTableColumn<AuditListRow>[] = [
    {
      key: "run",
      header: "Run",
      render: (row) => (
        <Link className="run-link" href={`/audits/${row.run_id}`}>
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
          <small className="muted">{row.domain ?? "n/a"}</small>
        </span>
      ),
    },
    {
      key: "coverage",
      header: "Coverage",
      render: (row) => <span className="tag">{row.inputs.coverage}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <span className={`audit-status audit-status-${row.status}`}>{row.status}</span>,
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
      key: "severity",
      header: "Severity Counts",
      render: (row) => (
        <span>
          <b>{row.summary.errors}</b> / {row.summary.warnings} / {row.summary.notices}
        </span>
      ),
    },
  ];

  return (
    <main className="container app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">SEO Audit Dashboard</p>
          <h1>All Audits</h1>
          <p className="hero-copy">Table view with filters, severity gates, and sorting for fast triage.</p>
        </div>
        <div className="hero-kpis">
          <div className="kpi-tile">
            <span>Total runs</span>
            <strong>{rows.length}</strong>
          </div>
          <div className="kpi-tile">
            <span>Filtered</span>
            <strong>{sortedRows.length}</strong>
          </div>
        </div>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <h2>Filters</h2>
          <span>
            <Link href="/compare">Compare runs</Link>
          </span>
        </div>

        <form className="audits-filters" method="get">
          <label>
            <span>Status</span>
            <select name="status" defaultValue={statusFilter}>
              <option value="all">All</option>
              <option value="healthy">Healthy</option>
              <option value="watch">Watch</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label>
            <span>Severity</span>
            <select name="severity" defaultValue={severityFilter}>
              <option value="all">All</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="notice">Notices</option>
            </select>
          </label>

          <label>
            <span>Coverage</span>
            <select name="coverage" defaultValue={coverageFilter}>
              <option value="all">All</option>
              <option value="quick">Quick</option>
              <option value="surface">Surface</option>
              <option value="full">Full</option>
            </select>
          </label>

          <label>
            <span>Domain</span>
            <select name="domain" defaultValue={domainFilter}>
              <option value="all">All</option>
              {domains.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Sort</span>
            <select name="sort" defaultValue={sortFilter}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="score_desc">Score desc</option>
              <option value="score_asc">Score asc</option>
              <option value="pages_desc">Pages desc</option>
              <option value="warnings_desc">Warnings desc</option>
            </select>
          </label>

          <button type="submit" className="btn-primary">
            Apply
          </button>
        </form>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <h2>Runs Table</h2>
          <span>{sortedRows.length} items</span>
        </div>
        <DataTable columns={columns} rows={sortedRows} getRowKey={(row) => row.run_id} emptyLabel="No runs match filters." />
      </section>
    </main>
  );
}
