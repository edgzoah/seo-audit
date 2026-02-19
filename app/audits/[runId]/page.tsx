import Link from "next/link";
import { notFound } from "next/navigation";

import { IssueUrlActions } from "../../../components/IssueUrlActions";
import { readRun } from "../../../lib/audits/fs";
import type { Issue } from "../../../lib/audits/types";
import { compactUrl, formatPercent, humanize } from "../../lib/format";

type SeverityRank = "error" | "warning" | "notice";
type IssueView = Issue & { sortKey: string; affectedCount: number };

interface AuditDetailPageProps {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{ category?: string; severity?: string }>;
}

const SEVERITY_WEIGHT: Record<SeverityRank, number> = {
  error: 0,
  warning: 1,
  notice: 2,
};

function normalizeSeverity(value: string | undefined): SeverityRank | "all" {
  if (value === "error" || value === "warning" || value === "notice") {
    return value;
  }

  return "all";
}

export default async function AuditDetailPage({ params, searchParams }: AuditDetailPageProps) {
  const { runId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const report = await readRun(runId);

  if (!report) {
    notFound();
  }

  const categoryFilter = query?.category ?? "all";
  const severityFilter = normalizeSeverity(query?.severity);
  const categories = Array.from(new Set(report.issues.map((issue) => issue.category))).sort((a, b) => a.localeCompare(b));

  const filteredIssues = report.issues.filter((issue) => {
    if (categoryFilter !== "all" && issue.category !== categoryFilter) {
      return false;
    }

    if (severityFilter !== "all" && issue.severity !== severityFilter) {
      return false;
    }

    return true;
  });

  const issueViews: IssueView[] = filteredIssues
    .map((issue) => ({
      ...issue,
      affectedCount: issue.affected_urls.length,
      sortKey: `${SEVERITY_WEIGHT[issue.severity]}-${String(99999 - issue.affected_urls.length).padStart(5, "0")}-${issue.id}`,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <main className="container app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Audit Detail</p>
          <h1>{compactUrl(report.inputs.target)}</h1>
          <p className="hero-copy">Run: {report.run_id}</p>
          <p className="hero-meta">
            Started: <b>{new Date(report.started_at).toLocaleString()}</b> | Coverage: <b>{report.inputs.coverage}</b>
          </p>
        </div>
        <div className="hero-kpis">
          <div className="kpi-tile">
            <span>Total score</span>
            <strong>{formatPercent(report.summary.score_total)}</strong>
          </div>
          <div className="kpi-tile">
            <span>Issues shown</span>
            <strong>{issueViews.length}</strong>
          </div>
        </div>
      </section>

      <section className="kpi-ribbon">
        <article className="kpi-card">
          <span>Pages crawled</span>
          <strong>{report.summary.pages_crawled}</strong>
        </article>
        <article className="kpi-card">
          <span>Errors</span>
          <strong>{report.summary.errors}</strong>
        </article>
        <article className="kpi-card">
          <span>Warnings</span>
          <strong>{report.summary.warnings}</strong>
        </article>
        <article className="kpi-card">
          <span>Notices</span>
          <strong>{report.summary.notices}</strong>
        </article>
        <article className="kpi-card">
          <span>Focus score</span>
          <strong>{formatPercent(report.summary.focus?.focus_score)}</strong>
        </article>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <h2>Issue Browser</h2>
          <span>
            <Link href="/audits">Back to audits</Link>
          </span>
        </div>
        <form className="audits-filters" method="get">
          <label>
            <span>Category</span>
            <select name="category" defaultValue={categoryFilter}>
              <option value="all">All</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {humanize(category)}
                </option>
              ))}
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
          <button type="submit" className="btn-primary">
            Apply
          </button>
        </form>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <h2>Issues</h2>
          <span>{issueViews.length} rows</span>
        </div>
        <div className="data-table-wrap">
          <table className="table issue-table">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Affected URLs</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {issueViews.map((issue) => (
                <tr key={issue.id} className="issue-row group">
                  <td>
                    <strong>{issue.title}</strong>
                    <p className="muted">{issue.description}</p>
                  </td>
                  <td>{humanize(issue.category)}</td>
                  <td>
                    <span className={`badge badge-${issue.severity}`}>{issue.severity}</span>
                  </td>
                  <td>
                    <div className="issue-url-stack">
                      {issue.affected_urls.slice(0, 3).map((url) => (
                        <div key={`${issue.id}-${url}`} className="issue-url-item">
                          <code title={url}>{compactUrl(url)}</code>
                          <IssueUrlActions url={url} />
                        </div>
                      ))}
                      {issue.affected_urls.length > 3 ? (
                        <small className="muted">+{issue.affected_urls.length - 3} more URLs</small>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div className="evidence-preview-list">
                      {issue.evidence.slice(0, 2).map((evidence, index) => (
                        <details key={`${issue.id}-preview-${index}`} className="evidence-popover">
                          <summary title={evidence.message}>{humanize(evidence.type)}</summary>
                          <div className="evidence-popover-content">
                            <p>{evidence.message}</p>
                            {evidence.url ? <code>{compactUrl(evidence.url)}</code> : null}
                          </div>
                        </details>
                      ))}
                    </div>
                    <details className="evidence-dialog">
                      <summary>Evidence ({issue.evidence.length})</summary>
                      <div className="evidence-dialog-content">
                        {issue.evidence.map((evidence, index) => (
                          <article key={`${issue.id}-evidence-${index}`} className="evidence-item">
                            <span className="tag">{humanize(evidence.type)}</span>
                            <p>{evidence.message}</p>
                            <div className="evidence-links">
                              {evidence.url ? <code title={evidence.url}>{compactUrl(evidence.url)}</code> : null}
                              {evidence.source_url ? (
                                <code title={evidence.source_url}>{compactUrl(evidence.source_url)}</code>
                              ) : null}
                              {evidence.target_url ? (
                                <code title={evidence.target_url}>{compactUrl(evidence.target_url)}</code>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
