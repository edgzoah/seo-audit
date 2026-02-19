import Link from "next/link";

import { NewAuditWizard } from "../../components/forms/NewAuditWizard";

export default function NewAuditPage() {
  return (
    <main className="container app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Audit Creator</p>
          <h1>Create a New SEO Audit</h1>
          <p className="hero-copy">Four-step workflow with validation, confirmation, and live run state.</p>
        </div>
        <div className="hero-kpis">
          <div className="kpi-tile">
            <span>Workflow</span>
            <strong>4 steps</strong>
          </div>
          <div className="kpi-tile">
            <span>Output</span>
            <strong>Run ID</strong>
          </div>
        </div>
      </section>

      <div className="panel-head">
        <h2>Setup</h2>
        <span>
          <Link href="/audits">Back to audits</Link>
        </span>
      </div>

      <NewAuditWizard />
    </main>
  );
}
