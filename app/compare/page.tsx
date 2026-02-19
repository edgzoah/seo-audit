import Link from "next/link";
import type { ReactElement } from "react";

import { AuditPanel } from "../../components/AuditPanel";
import { ScoreDeltaChart } from "../../components/charts/ScoreDeltaChart";
import { listDiffCandidates, readDiff } from "../../lib/audits/fs";
import type { DiffReport } from "../../lib/audits/types";
import { humanize } from "../lib/format";

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
  const fallbackBaseline =
    baseline && candidates.includes(baseline)
      ? baseline
      : candidates.find((candidate) => candidate !== fallbackCurrent) ?? fallbackCurrent;

  return {
    baseline: fallbackBaseline,
    current: fallbackCurrent,
  };
}

function renderIssueList(title: string, items: string[]): ReactElement {
  return (
    <article className="card panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      {items.length > 0 ? (
        <ul className="token-list">
          {items.slice(0, 25).map((item) => (
            <li key={item}>{humanize(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No items.</p>
      )}
    </article>
  );
}

function renderRegressed(diff: DiffReport): ReactElement {
  return (
    <article className="card panel">
      <div className="panel-head">
        <h2>Regressed Issues</h2>
        <span>{diff.regressed_issues.length}</span>
      </div>
      {diff.regressed_issues.length > 0 ? (
        <table className="table compact">
          <thead>
            <tr>
              <th>Issue</th>
              <th>Count</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {diff.regressed_issues.slice(0, 25).map((issue) => (
              <tr key={issue.id}>
                <td>{humanize(issue.id)}</td>
                <td>
                  {issue.baseline_count} → {issue.current_count}
                </td>
                <td>
                  {issue.baseline_max_severity} → {issue.current_max_severity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No regressions.</p>
      )}
    </article>
  );
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const query = searchParams ? await searchParams : undefined;
  const candidates = await listDiffCandidates();

  if (candidates.length < 2) {
    return (
      <main className="container app-shell">
        <section className="card panel">
          <div className="panel-head">
            <h2>Compare Runs</h2>
            <span>
              <Link href="/audits">Go to audits</Link>
            </span>
          </div>
          <p className="muted">At least two valid runs are required for comparison.</p>
        </section>
      </main>
    );
  }

  const selected = getInitialSelection(candidates, query?.baseline, query?.current);
  const diff = await readDiff(selected.baseline, selected.current);

  if (!diff) {
    return (
      <main className="container app-shell">
        <section className="card panel">
          <p className="muted">Could not build diff for selected runs.</p>
        </section>
      </main>
    );
  }

  const scoreMap: ScoreDeltaMap = diff.score_by_category_delta;
  const chartData = toChartData(scoreMap);

  return (
    <main className="container app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Run Comparison</p>
          <h1>Compare Audits</h1>
          <p className="hero-copy">
            Baseline: <b>{diff.baseline_run_id}</b> | Current: <b>{diff.current_run_id}</b>
          </p>
        </div>
        <div className="hero-kpis">
          <div className="kpi-tile">
            <span>Score delta</span>
            <strong>{diff.score_total_delta > 0 ? `+${diff.score_total_delta.toFixed(1)}` : diff.score_total_delta.toFixed(1)}</strong>
          </div>
        </div>
      </section>

      <AuditPanel.Root>
        <AuditPanel.Header title="Select runs" meta={<Link href="/audits">Audits list</Link>} />
        <AuditPanel.Body>
          <form className="audits-filters" method="get">
            <label>
              <span>Baseline</span>
              <select name="baseline" defaultValue={selected.baseline}>
                {candidates.map((candidate) => (
                  <option key={`baseline-${candidate}`} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Current</span>
              <select name="current" defaultValue={selected.current}>
                {candidates.map((candidate) => (
                  <option key={`current-${candidate}`} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-primary">
              Compare
            </button>
          </form>
        </AuditPanel.Body>
      </AuditPanel.Root>

      <AuditPanel.Root>
        <AuditPanel.Header title="Score Delta by Category" meta={<>{chartData.length} categories</>} />
        <AuditPanel.Body>
          <ScoreDeltaChart data={chartData} />
        </AuditPanel.Body>
      </AuditPanel.Root>

      <section className="compare-grid">
        {renderIssueList("Resolved Issues", diff.resolved_issues)}
        {renderIssueList("New Issues", diff.new_issues)}
      </section>

      {renderRegressed(diff)}
    </main>
  );
}
