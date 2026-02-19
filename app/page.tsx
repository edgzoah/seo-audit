import Link from "next/link";
import { listRuns } from "../lib/audits/fs";
import { formatPercent } from "./lib/format";

export default async function HomePage() {
  const runs = await listRuns(50);
  const recent = runs[0];

  return (
    <main className="container app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">SEO Audit Platform</p>
          <h1>Runs Dashboard</h1>
          <p className="hero-copy">
            Przerobione pod Next.js. Dane są po stronie serwera, a UI jest gotowy pod dalsze komponenty
            `shadcn/ui` i wykresy.
          </p>
        </div>
        <div className="hero-kpis">
          <div className="kpi-tile">
            <span>All runs</span>
            <strong>{runs.length}</strong>
          </div>
          <div className="kpi-tile">
            <span>Latest score</span>
            <strong>{formatPercent(recent?.summary.score_total)}</strong>
          </div>
        </div>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <h2>Recent Runs</h2>
          <span>
            {runs.length} items • <Link href="/audits">Open audits table</Link>
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Target</th>
              <th>Score</th>
              <th>Pages</th>
              <th>Warnings</th>
              <th>Notices</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.run_id}>
                <td>
                  <Link className="run-link" href={`/runs/${run.run_id}`}>
                    {run.run_id}
                  </Link>
                </td>
                <td>{run.inputs.target || "-"}</td>
                <td>{formatPercent(run.summary.score_total)}</td>
                <td>{run.summary.pages_crawled ?? "-"}</td>
                <td>{run.summary.warnings ?? "-"}</td>
                <td>{run.summary.notices ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
