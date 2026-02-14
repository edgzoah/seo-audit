import type { Issue, PageExtract, Report } from "./report-schema.js";

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
    return "error";
  }
  if (severity === "warning") {
    return "warning";
  }
  return "notice";
}

function severityLabel(severity: Issue["severity"]): string {
  return severity === "error" ? "ERROR" : severity === "warning" ? "WARNING" : "NOTICE";
}

function humanizeToken(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const path = `${parsed.pathname || "/"}${parsed.search}`;
    return path === "/" ? parsed.hostname : path;
  } catch {
    return value;
  }
}

function renderUrlItems(urls: string[], limit = 8): string {
  const preview = urls.slice(0, limit);
  const rest = Math.max(0, urls.length - limit);
  const items = preview
    .map((url) => `<li><code title="${escapeHtml(url)}">${escapeHtml(compactUrl(url))}</code></li>`)
    .join("");
  return `${items}${rest > 0 ? `<li class="dim">+${rest} more</li>` : ""}`;
}

function renderStatCards(items: Array<{ label: string; value: number | string }>): string {
  return items
    .map(
      (item) => `
      <div class="stat-card">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(String(item.value))}</strong>
      </div>`,
    )
    .join("");
}

function renderIssue(issue: Issue): string {
  const evidence = issue.evidence
    .slice(0, 8)
    .map((item) => `<li>${escapeHtml(item.message)}</li>`)
    .join("");

  const affectedPreview = issue.affected_urls.slice(0, 5).map((url) => `<li>${escapeHtml(url)}</li>`).join("");
  const affectedRest = Math.max(0, issue.affected_urls.length - 5);
  const tags = issue.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("");

  return `
    <article class="issue-card ${severityClass(issue.severity)}">
      <div class="issue-headline">
        <div>
          <h3>${escapeHtml(issue.title)}</h3>
          <p class="meta">${escapeHtml(issue.id)} · category: ${escapeHtml(issue.category)} · rank ${issue.rank}</p>
        </div>
        <span class="severity severity-${severityClass(issue.severity)}">${severityLabel(issue.severity)}</span>
      </div>
      <p class="issue-description">${escapeHtml(issue.description)}</p>
      <p><strong>Recommendation:</strong> ${escapeHtml(issue.recommendation)}</p>
      <div class="chip-row">${tags || "<span class='chip'>no-tags</span>"}</div>
      <details>
        <summary>Details (${issue.affected_urls.length} URLs)</summary>
        <div class="split">
          <section>
            <h4>Affected URLs</h4>
            <ul class="url-list">${affectedPreview || "<li>none</li>"}</ul>
            ${affectedRest > 0 ? `<p class="meta">+${affectedRest} more</p>` : ""}
          </section>
          <section>
            <h4>Evidence</h4>
            <ul class="evidence-list">${evidence || "<li>none</li>"}</ul>
          </section>
        </div>
      </details>
    </article>
  `.trim();
}

function findFocusPage(report: Report): PageExtract | null {
  const focusUrl = report.summary.focus?.primary_url;
  if (!focusUrl || !report.page_extracts) {
    return null;
  }
  return report.page_extracts.find((page) => page.final_url === focusUrl || page.url === focusUrl) ?? null;
}

export function renderReportHtml(report: Report): string {
  const scoreCards = Object.entries(report.summary.score_by_category)
    .map(([category, score]) => `<div class="score-pill"><span>${escapeHtml(category)}</span><strong>${score}</strong></div>`)
    .join("");

  const actions = (report.prioritized_actions ?? [])
    .map(
      (action) => `
      <li class="action-card">
        <div class="row">
          <strong>${escapeHtml(action.title)}</strong>
          <span class="chip">${escapeHtml(action.impact.toUpperCase())} impact</span>
        </div>
        <span class="dim">effort: ${escapeHtml(action.effort)}</span>
        <p>${escapeHtml(action.rationale)}</p>
      </li>`,
    )
    .join("");

  const fixes = (report.proposed_fixes ?? [])
    .map(
      (fix) => `
      <li class="action-card">
        <div class="row">
          <strong>${escapeHtml(humanizeToken(fix.issue_id))}</strong>
          <span class="chip">${escapeHtml(fix.issue_id)}</span>
        </div>
        <p class="dim"><b>URL:</b> <code title="${escapeHtml(fix.page_url)}">${escapeHtml(compactUrl(fix.page_url))}</code></p>
        <p>${escapeHtml(fix.proposal)}</p>
        <p class="dim">${escapeHtml(fix.rationale)}</p>
      </li>`,
    )
    .join("");
  const internalLinkPlan = report.proposed_packs?.internal_link_plan?.length
    ? report.proposed_packs.internal_link_plan
    : (report.internal_link_plan ?? []);
  const internalLinkPlanRows = internalLinkPlan
    .map(
      (item) => `
      <li>
        <div class="row">
          <strong>${escapeHtml(item.suggestedAnchor)}</strong>
          <code title="${escapeHtml(item.sourceUrl)}">${escapeHtml(compactUrl(item.sourceUrl))}</code>
        </div>
        <p>${escapeHtml(item.suggestedSentenceContext)}</p>
      </li>`,
    )
    .join("");
  const focusPage = findFocusPage(report);
  const focusSummary = report.summary.focus;
  const focusH1 = focusPage?.headings_outline.find((item) => item.level === 1)?.text ?? "(missing)";
  const focusHeadingsTop = focusPage?.headings_outline.slice(0, 5).map((item) => item.text) ?? [];
  const titleMismatch = report.issues.some((issue) => issue.id === "title_h1_mismatch" && issue.affected_urls.includes(focusPage?.url ?? ""));
  const serpCounts = {
    mismatch: report.issues.filter((issue) => issue.id === "title_h1_mismatch").length,
    missing: report.issues.filter((issue) => issue.id === "meta_description_missing").length,
    duplicate: report.issues.filter((issue) => issue.id === "meta_description_duplicate").length,
    spammy: report.issues.filter((issue) => issue.id === "meta_description_spammy").length,
  };
  const scoreTotal = report.summary.score_total;
  const scoreClass = scoreTotal >= 75 ? "good" : scoreTotal >= 45 ? "ok" : "bad";
  const serpCards = renderStatCards([
    { label: "Title/H1 mismatch", value: serpCounts.mismatch },
    { label: "Missing descriptions", value: serpCounts.missing },
    { label: "Duplicate descriptions", value: serpCounts.duplicate },
    { label: "Spammy descriptions", value: serpCounts.spammy },
  ]);
  const schemaCards = renderStatCards([
    { label: "Invalid breadcrumb schema", value: report.issues.filter((item) => item.id === "breadcrumb_schema_invalid").length },
    { label: "Incomplete org schema", value: report.issues.filter((item) => item.id === "org_schema_incomplete").length },
  ]);
  const topFocusIssues = report.summary.focus?.focus_top_issues ?? [];
  const topFocusAnchors = focusSummary?.focusAnchorQuality?.topAnchors ?? [];
  const topInlinkSources = focusSummary?.topInlinkSourcesToFocus ?? [];
  const topInternalAnchors = report.summary.internal_links?.topAnchors ?? [];

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SEO Audit ${escapeHtml(report.run_id)}</title>
    <style>
      :root {
        --bg: #f2f4f7;
        --paper: #ffffff;
        --ink: #0f172a;
        --muted: #475467;
        --line: #d0d5dd;
        --brand: #124f8c;
        --brand-soft: #e6eef8;
        --ok: #0d9488;
        --warn: #b45309;
        --bad: #b42318;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Space Grotesk", "IBM Plex Sans", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 95% 0%, #dce8f8 0, transparent 40%),
          radial-gradient(circle at 0% 100%, #e6f6f4 0, transparent 45%),
          var(--bg);
      }
      .layout {
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px;
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        gap: 20px;
      }
      .toc {
        position: sticky;
        top: 16px;
        align-self: start;
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 14px;
      }
      .toc h3 {
        margin: 0 0 10px;
        font-size: 0.95rem;
      }
      .toc a {
        display: block;
        padding: 7px 8px;
        border-radius: 8px;
        color: var(--muted);
        text-decoration: none;
        font-size: 0.9rem;
      }
      .toc a:hover { background: #f8fafc; color: var(--ink); }
      .content { min-width: 0; }
      .hero {
        background: linear-gradient(130deg, #103a63, #124f8c);
        color: #f8fbff;
        border-radius: 16px;
        padding: 20px;
        display: grid;
        gap: 10px;
      }
      .hero-top {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: start;
        flex-wrap: wrap;
      }
      .hero h1 { margin: 0; font-size: 1.6rem; letter-spacing: 0.2px; }
      .meta { margin: 0; color: var(--muted); font-size: 0.9rem; }
      .dim { color: var(--muted); font-size: 0.9rem; }
      .hero .meta { color: #d5e4f7; }
      .score-badge {
        border-radius: 14px;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.25);
        min-width: 140px;
        text-align: center;
      }
      .score-badge strong { display: block; font-size: 1.8rem; }
      .score-badge.good strong { color: #a7f3d0; }
      .score-badge.ok strong { color: #fde68a; }
      .score-badge.bad strong { color: #fecaca; }
      .summary-grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 10px;
      }
      .metric {
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 10px;
        padding: 9px 10px;
        background: rgba(255, 255, 255, 0.08);
      }
      .metric span { display: block; font-size: 0.78rem; color: #dbe9f9; }
      .metric strong { font-size: 1.1rem; color: #fff; }
      .panel {
        margin-top: 16px;
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px;
      }
      .panel h2 {
        margin: 0 0 10px;
        font-size: 1.1rem;
        border-bottom: 1px solid #eef2f6;
        padding-bottom: 8px;
      }
      .kv-grid {
        display: grid;
        gap: 8px 14px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }
      .kv {
        background: #fbfcff;
        border: 1px solid #eef2f6;
        border-radius: 10px;
        padding: 8px 10px;
        overflow-wrap: anywhere;
      }
      .kv b { color: var(--ink); }
      .score-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
      }
      .score-pill {
        border: 1px solid #dbe3ea;
        border-radius: 10px;
        padding: 10px;
        background: linear-gradient(180deg, #fff, #f8fbff);
      }
      .score-pill span { display: block; color: var(--muted); font-size: 0.8rem; text-transform: capitalize; }
      .score-pill strong { font-size: 1.4rem; }
      .stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }
      .stat-card {
        border: 1px solid #dbe3ea;
        border-radius: 10px;
        padding: 10px;
        background: linear-gradient(180deg, #fff, #f8fbff);
      }
      .stat-card span { display: block; color: var(--muted); font-size: 0.8rem; }
      .stat-card strong { font-size: 1.35rem; }
      .split {
        margin-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .chip-row { margin: 8px 0 0; display: flex; gap: 6px; flex-wrap: wrap; }
      .chip {
        border: 1px solid #d5dfea;
        color: #334155;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 0.78rem;
        background: #f8fafc;
      }
      .issue-list { display: grid; gap: 10px; }
      .issue-card {
        border: 1px solid var(--line);
        border-left: 6px solid #94a3b8;
        border-radius: 12px;
        padding: 12px;
        background: #fff;
      }
      .issue-card.error { border-left-color: var(--bad); }
      .issue-card.warning { border-left-color: var(--warn); }
      .issue-card.notice { border-left-color: var(--brand); }
      .issue-headline {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
      }
      .issue-headline h3 { margin: 0 0 3px; font-size: 1.02rem; }
      .severity {
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 0.75rem;
        font-weight: 700;
        border: 1px solid transparent;
      }
      .severity-error { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
      .severity-warning { background: #fffbeb; color: #92400e; border-color: #fed7aa; }
      .severity-notice { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
      .issue-description { margin: 8px 0; }
      details summary {
        cursor: pointer;
        color: var(--brand);
        font-weight: 600;
        margin-top: 8px;
      }
      ul { margin: 8px 0 0 18px; padding: 0; }
      li { margin-bottom: 5px; }
      p, li, .kv { line-height: 1.45; }
      .url-list code,
      .inline-list code {
        background: #eef4fb;
        border: 1px solid #d8e5f5;
        border-radius: 6px;
        padding: 2px 6px;
        font-size: 0.82rem;
      }
      .evidence-list li {
        border-left: 2px solid #d7dee7;
        padding-left: 8px;
      }
      .focus-layout {
        display: grid;
        grid-template-columns: 1.3fr 1fr;
        gap: 12px;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }
      .data-table th,
      .data-table td {
        border-bottom: 1px solid #e5edf5;
        text-align: left;
        padding: 8px 6px;
        vertical-align: top;
      }
      .data-table th { color: var(--muted); font-size: 0.83rem; font-weight: 600; }
      .focus-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .focus-list li {
        padding: 7px 10px;
        border: 1px solid #e6edf5;
        border-radius: 8px;
        margin-bottom: 7px;
        background: #fcfdff;
      }
      .action-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      .action-card {
        border: 1px solid #dce4ee;
        border-radius: 10px;
        padding: 10px;
        background: #fbfdff;
      }
      .row {
        display: flex;
        gap: 8px;
        justify-content: space-between;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .inline-list { margin: 0; }
      .inline-list li { margin: 4px 0; }
      @media (max-width: 1000px) {
        .layout { grid-template-columns: 1fr; }
        .toc { position: static; }
        .focus-layout { grid-template-columns: 1fr; }
      }
      @media (max-width: 760px) {
        .split { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <aside class="toc">
        <h3>Navigate</h3>
        <a href="#summary">Summary</a>
        <a href="#scores">Scores</a>
        <a href="#focus">Focus</a>
        <a href="#links">Internal Links</a>
        <a href="#serp">SERP</a>
        <a href="#schema">Schema</a>
        <a href="#performance">Performance</a>
        <a href="#link-plan">Link Plan</a>
        <a href="#issues">Issues</a>
      </aside>
      <main class="content">
      <section class="hero">
        <div class="hero-top">
          <div>
            <h1>SEO Audit Report</h1>
            <p class="meta">Run: ${escapeHtml(report.run_id)}</p>
            <p class="meta">Target: ${escapeHtml(report.inputs.target)}</p>
            <p class="meta">Coverage: ${escapeHtml(report.inputs.coverage)}</p>
          </div>
          <div class="score-badge ${scoreClass}">
            <span>Score Total</span>
            <strong>${scoreTotal}</strong>
          </div>
        </div>
        <div class="summary-grid">
          <div class="metric"><span>Pages Crawled</span><strong>${report.summary.pages_crawled}</strong></div>
          <div class="metric"><span>Errors</span><strong>${report.summary.errors}</strong></div>
          <div class="metric"><span>Warnings</span><strong>${report.summary.warnings}</strong></div>
          <div class="metric"><span>Notices</span><strong>${report.summary.notices}</strong></div>
          ${report.summary.focus ? `<div class="metric"><span>Focus Score</span><strong>${report.summary.focus.focus_score}</strong></div>` : ""}
        </div>
      </section>

      <section class="panel" id="summary">
        <h2>Summary</h2>
        <div class="kv-grid">
          <div class="kv"><b>Run ID:</b> ${escapeHtml(report.run_id)}</div>
          <div class="kv"><b>Started:</b> ${escapeHtml(report.started_at)}</div>
          <div class="kv"><b>Finished:</b> ${escapeHtml(report.finished_at)}</div>
          <div class="kv"><b>Target:</b> ${escapeHtml(report.inputs.target)}</div>
        </div>
      </section>

      <section class="panel" id="scores">
        <h2>Scores by Category</h2>
        <div class="score-row">${scoreCards || "<p class='dim'>(no category scores)</p>"}</div>
      </section>

      ${
        report.summary.focus
          ? `
      <section class="panel" id="focus">
        <h2>Focus Deep Dive</h2>
        <div class="focus-layout">
          <div>
            <div class="kv-grid">
              <div class="kv"><b>Primary URL:</b> <code title="${escapeHtml(report.summary.focus.primary_url)}">${escapeHtml(compactUrl(report.summary.focus.primary_url))}</code></div>
              <div class="kv"><b>Title/H1 mismatch:</b> ${titleMismatch ? "yes" : "no"}</div>
              <div class="kv"><b>Word count (main):</b> ${focusPage?.wordCountMain ?? 0}</div>
              <div class="kv"><b>Focus inlinks:</b> ${focusSummary?.focusInlinksCount ?? 0}</div>
              <div class="kv"><b>Title:</b> ${escapeHtml(focusPage?.titleText || "(missing)")}</div>
              <div class="kv"><b>H1:</b> ${escapeHtml(focusH1)}</div>
            </div>
            <h3>Top Headings</h3>
            <ul class="focus-list">
              ${
                focusHeadingsTop.length > 0
                  ? focusHeadingsTop.map((heading) => `<li>${escapeHtml(heading)}</li>`).join("")
                  : "<li>(none)</li>"
              }
            </ul>
          </div>
          <div>
            <h3>Top Focus Issues</h3>
            <ul class="focus-list">
              ${topFocusIssues.length > 0 ? topFocusIssues.map((item) => `<li>${escapeHtml(humanizeToken(item))}</li>`).join("") : "<li>none</li>"}
            </ul>
            <h3>Top Inlink Sources</h3>
            <ul class="focus-list">
              ${topInlinkSources.length > 0 ? renderUrlItems(topInlinkSources, 8) : "<li>none</li>"}
            </ul>
            <h3>Top Anchors</h3>
            <table class="data-table">
              <thead><tr><th>Anchor</th><th>Count</th></tr></thead>
              <tbody>
              ${
                topFocusAnchors.length > 0
                  ? topFocusAnchors
                      .slice(0, 8)
                      .map((item) => `<tr><td>${escapeHtml(item.anchor || "(empty)")}</td><td>${item.count}</td></tr>`)
                      .join("")
                  : "<tr><td colspan='2'>none</td></tr>"
              }
              </tbody>
            </table>
          </div>
        </div>
      </section>`
          : ""
      }

      <section class="panel" id="links">
        <h2>Internal Link Graph Summary</h2>
        ${
          report.summary.internal_links
            ? `<div class="kv-grid">
                 <div class="kv"><b>Orphan pages:</b> ${report.summary.internal_links.orphanPagesCount}</div>
                 <div class="kv"><b>Near-orphan pages:</b> ${report.summary.internal_links.nearOrphanPagesCount}</div>
                 <div class="kv"><b>Nav-likely inlinks:</b> ${report.summary.internal_links.navLikelyInlinksPercent}%</div>
               </div>`
            : "<p class='dim'>Internal link graph metrics unavailable.</p>"
        }
        ${
          topInternalAnchors.length > 0
            ? `<table class="data-table">
                 <thead><tr><th>Top internal anchors</th><th>Count</th></tr></thead>
                 <tbody>
                   ${topInternalAnchors
                     .slice(0, 10)
                     .map((item) => `<tr><td>${escapeHtml(item.anchor || "(empty)")}</td><td>${item.count}</td></tr>`)
                     .join("")}
                 </tbody>
               </table>`
            : ""
        }
      </section>

      <section class="panel" id="serp">
        <h2>SERP Quality Summary</h2>
        <div class="stat-grid">${serpCards}</div>
      </section>

      <section class="panel" id="schema">
        <h2>Schema Quality Summary</h2>
        <div class="stat-grid">${schemaCards}</div>
      </section>

      <section class="panel" id="performance">
        <h2>Performance Summary</h2>
        ${
          !report.summary.performanceFocus && !report.summary.performanceHome
            ? "<p class='dim'>Performance not measured.</p>"
            : `
          ${
            report.summary.performanceFocus
              ? `<p><strong>Focus:</strong> ${report.summary.performanceFocus.status}, LCP=${report.summary.performanceFocus.lcpMs ?? "n/a"}, INP=${report.summary.performanceFocus.inpMs ?? "n/a"}, CLS=${report.summary.performanceFocus.cls ?? "n/a"}, score=${report.summary.performanceFocus.scorePerf ?? "n/a"}</p>`
              : ""
          }
          ${
            report.summary.performanceHome
              ? `<p><strong>Home:</strong> ${report.summary.performanceHome.status}, LCP=${report.summary.performanceHome.lcpMs ?? "n/a"}, INP=${report.summary.performanceHome.inpMs ?? "n/a"}, CLS=${report.summary.performanceHome.cls ?? "n/a"}, score=${report.summary.performanceHome.scorePerf ?? "n/a"}</p>`
              : ""
          }`
        }
      </section>

      ${
        internalLinkPlanRows
          ? `
      <section class="panel" id="link-plan">
        <h2>Internal Link Plan</h2>
        <ul class="inline-list action-list">${internalLinkPlanRows}</ul>
      </section>`
          : ""
      }

      ${
        fixes
          ? `
      <section class="panel">
        <h2>Proposed Fixes (LLM)</h2>
        <ul class="action-list">${fixes}</ul>
      </section>`
          : ""
      }

      ${
        actions
          ? `
      <section class="panel">
        <h2>Prioritized Actions (LLM)</h2>
        <ul class="action-list">${actions}</ul>
      </section>`
          : ""
      }

      <section class="panel" id="issues">
        <h2>Issues (${report.issues.length})</h2>
        <div class="issue-list">
          ${report.issues.map((issue) => renderIssue(issue)).join("") || "<p class='dim'>No issues found.</p>"}
        </div>
      </section>
      </main>
    </div>
  </body>
</html>
`.trim();
}
