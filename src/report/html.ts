import type { Issue, Report } from "./report-schema.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function severityClass(severity: Issue["severity"]): string {
  if (severity === "error") {
    return "sev-error";
  }
  if (severity === "warning") {
    return "sev-warning";
  }
  return "sev-notice";
}

function renderIssue(issue: Issue): string {
  const evidence = issue.evidence
    .slice(0, 4)
    .map((item) => `<li>${escapeHtml(item.message)}</li>`)
    .join("");

  const affectedPreview = issue.affected_urls.slice(0, 5).map((url) => `<li>${escapeHtml(url)}</li>`).join("");
  const affectedRest = Math.max(0, issue.affected_urls.length - 5);

  return `
    <article class="issue-card ${severityClass(issue.severity)}">
      <header class="issue-head">
        <h3>${escapeHtml(issue.title)}</h3>
        <p class="meta">${escapeHtml(issue.id)} · ${escapeHtml(issue.severity.toUpperCase())} · rank ${issue.rank}</p>
      </header>
      <p>${escapeHtml(issue.description)}</p>
      <p><strong>Category:</strong> ${escapeHtml(issue.category)}</p>
      <p><strong>Tags:</strong> ${issue.tags.map((tag) => escapeHtml(tag)).join(", ")}</p>
      <p><strong>Recommendation:</strong> ${escapeHtml(issue.recommendation)}</p>
      <div class="grid-2">
        <section>
          <h4>Affected URLs</h4>
          <ul>${affectedPreview || "<li>none</li>"}</ul>
          ${affectedRest > 0 ? `<p class="dim">+${affectedRest} more</p>` : ""}
        </section>
        <section>
          <h4>Evidence</h4>
          <ul>${evidence || "<li>none</li>"}</ul>
        </section>
      </div>
    </article>
  `.trim();
}

export function renderReportHtml(report: Report): string {
  const scoreCards = Object.entries(report.summary.score_by_category)
    .map(([category, score]) => `<div class="score-pill"><span>${escapeHtml(category)}</span><strong>${score}</strong></div>`)
    .join("");

  const actions = (report.prioritized_actions ?? [])
    .map(
      (action) => `
      <li>
        <strong>${escapeHtml(action.title)}</strong>
        <span class="dim">impact: ${escapeHtml(action.impact)}, effort: ${escapeHtml(action.effort)}</span>
        <p>${escapeHtml(action.rationale)}</p>
      </li>`,
    )
    .join("");

  const fixes = (report.proposed_fixes ?? [])
    .map(
      (fix) => `
      <li>
        <strong>${escapeHtml(fix.issue_id)}</strong> → ${escapeHtml(fix.page_url)}
        <p>${escapeHtml(fix.proposal)}</p>
        <p class="dim">${escapeHtml(fix.rationale)}</p>
      </li>`,
    )
    .join("");

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SEO Audit ${escapeHtml(report.run_id)}</title>
    <style>
      :root {
        --bg: #f6f4ef;
        --paper: #ffffff;
        --ink: #1f2933;
        --dim: #667085;
        --accent: #10634f;
        --error: #b42318;
        --warning: #b54708;
        --notice: #026aa2;
        --line: #d0d5dd;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; background: radial-gradient(circle at top right, #d6f5e7, var(--bg) 45%); color: var(--ink); }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
      .hero { background: linear-gradient(135deg, #113f67, #10634f); color: #f8fbff; border-radius: 14px; padding: 20px; box-shadow: 0 12px 28px rgba(16, 99, 79, 0.2); }
      .hero h1 { margin: 0 0 8px; font-size: 1.5rem; }
      .hero p { margin: 4px 0; color: #dbe8f5; }
      .panel { margin-top: 18px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
      .score-row { display: flex; flex-wrap: wrap; gap: 10px; }
      .score-pill { min-width: 130px; border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: #fbfcfe; }
      .score-pill span { display: block; color: var(--dim); font-size: 0.85rem; text-transform: capitalize; }
      .score-pill strong { font-size: 1.3rem; }
      .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
      .summary-grid div { border: 1px solid var(--line); border-radius: 10px; padding: 8px; background: #fff; }
      .issue-list { display: grid; gap: 12px; }
      .issue-card { border: 1px solid var(--line); border-left: 6px solid var(--notice); border-radius: 12px; background: #fff; padding: 14px; }
      .issue-card.sev-error { border-left-color: var(--error); }
      .issue-card.sev-warning { border-left-color: var(--warning); }
      .issue-card.sev-notice { border-left-color: var(--notice); }
      .issue-head h3 { margin: 0 0 4px; }
      .meta, .dim { color: var(--dim); font-size: 0.9rem; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      ul { margin: 6px 0 0 18px; padding: 0; }
      li { margin-bottom: 4px; }
      h2 { margin-top: 0; }
      @media (max-width: 760px) { .grid-2 { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="hero">
        <h1>SEO Audit Report</h1>
        <p><strong>Run:</strong> ${escapeHtml(report.run_id)}</p>
        <p><strong>Target:</strong> ${escapeHtml(report.inputs.target)}</p>
        <p><strong>Coverage:</strong> ${escapeHtml(report.inputs.coverage)}</p>
      </section>

      <section class="panel">
        <h2>Summary</h2>
        <div class="summary-grid">
          <div><span class="dim">Score Total</span><strong>${report.summary.score_total}</strong></div>
          <div><span class="dim">Pages Crawled</span><strong>${report.summary.pages_crawled}</strong></div>
          <div><span class="dim">Errors</span><strong>${report.summary.errors}</strong></div>
          <div><span class="dim">Warnings</span><strong>${report.summary.warnings}</strong></div>
          <div><span class="dim">Notices</span><strong>${report.summary.notices}</strong></div>
          ${
            report.summary.focus
              ? `<div><span class="dim">Focus Score</span><strong>${report.summary.focus.focus_score}</strong></div>`
              : ""
          }
        </div>
      </section>

      <section class="panel">
        <h2>Scores by Category</h2>
        <div class="score-row">${scoreCards || "<p class='dim'>(no category scores)</p>"}</div>
      </section>

      ${
        report.summary.focus
          ? `
      <section class="panel">
        <h2>Focus Section</h2>
        <p><strong>Primary URL:</strong> ${escapeHtml(report.summary.focus.primary_url)}</p>
        <p><strong>Top Focus Issues:</strong> ${
          report.summary.focus.focus_top_issues.length > 0
            ? report.summary.focus.focus_top_issues.map((item) => escapeHtml(item)).join(", ")
            : "none"
        }</p>
      </section>`
          : ""
      }

      ${
        fixes
          ? `
      <section class="panel">
        <h2>Proposed Fixes (LLM)</h2>
        <ul>${fixes}</ul>
      </section>`
          : ""
      }

      ${
        actions
          ? `
      <section class="panel">
        <h2>Prioritized Actions (LLM)</h2>
        <ul>${actions}</ul>
      </section>`
          : ""
      }

      <section class="panel">
        <h2>Issues (${report.issues.length})</h2>
        <div class="issue-list">
          ${report.issues.map((issue) => renderIssue(issue)).join("") || "<p class='dim'>No issues found.</p>"}
        </div>
      </section>
    </main>
  </body>
</html>
`.trim();
}
