import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "../config/index.js";
import { extractPageData } from "../extract/index.js";
import type { AuditInputs, Issue, PageExtract, Report } from "../report/report-schema.js";
import { writeRunReports } from "../report/index.js";
import { runRules } from "../rules/index.js";

export interface AuditRunResult {
  runId: string;
  runDir: string;
  targetUrl: string;
  issues: Issue[];
}

function buildRunId(now: Date = new Date()): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  return `run-${iso}`;
}

function buildInputs(targetUrl: string, defaults: Awaited<ReturnType<typeof loadConfig>>["defaults"]): AuditInputs {
  return {
    target_type: "url",
    target: targetUrl,
    coverage: defaults.coverage,
    max_pages: 1,
    crawl_depth: 0,
    include_patterns: defaults.include_patterns,
    exclude_patterns: defaults.exclude_patterns,
    allowed_domains: defaults.allowed_domains,
    respect_robots: false,
    rendering_mode: defaults.rendering_mode,
    user_agent: defaults.user_agent,
    timeout_ms: defaults.timeout_ms,
    locale: defaults.locale,
    report_format: defaults.report_format,
    llm_enabled: false,
    baseline_run_id: null,
    brief: {
      text: "",
      focus: {
        primary_url: null,
        primary_keyword: null,
        goal: null,
        current_position: null,
        secondary_urls: [],
      },
      constraints: [],
      weighting_overrides: {
        boost_rules: [],
        boost_categories: [],
      },
    },
  };
}

function buildCanonicalReport(input: {
  runId: string;
  startedAt: string;
  finishedAt: string;
  inputs: AuditInputs;
  page: PageExtract;
  issues: Issue[];
}): Report {
  const errors = input.issues.filter((issue) => issue.severity === "error").length;
  const warnings = input.issues.filter((issue) => issue.severity === "warning").length;
  const notices = input.issues.filter((issue) => issue.severity === "notice").length;

  const scoreTotal = Math.max(0, 100 - errors * 10 - warnings * 5 - notices * 2);

  return {
    run_id: input.runId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    inputs: input.inputs,
    summary: {
      score_total: scoreTotal,
      score_by_category: {
        seo: scoreTotal,
        technical: scoreTotal,
        content: scoreTotal,
        security: scoreTotal,
        performance: scoreTotal,
      },
      pages_crawled: 1,
      errors,
      warnings,
      notices,
    },
    issues: input.issues,
    pages: [
      {
        url: input.page.url,
        final_url: input.page.final_url,
        status: input.page.status,
        title: input.page.title,
        canonical: input.page.canonical,
      },
    ],
  };
}

export async function runAuditCommand(targetUrl: string): Promise<AuditRunResult> {
  const startedAtDate = new Date();
  const normalizedUrl = new URL(targetUrl).toString();
  const config = await loadConfig();
  const inputs = buildInputs(normalizedUrl, config.defaults);

  const runId = buildRunId(startedAtDate);
  const runDir = path.join(process.cwd(), "runs", runId);
  await mkdir(runDir, { recursive: true });

  await writeFile(path.join(runDir, "inputs.json"), `${JSON.stringify(inputs, null, 2)}\n`, "utf-8");

  const response = await fetch(normalizedUrl, {
    headers: {
      "user-agent": inputs.user_agent,
      accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(inputs.timeout_ms),
  });

  const html = await response.text();
  const extracted = extractPageData(html, normalizedUrl, response.url || normalizedUrl, response.status);
  const issues = runRules(extracted);

  await writeFile(path.join(runDir, "pages.json"), `${JSON.stringify([extracted], null, 2)}\n`, "utf-8");
  await writeFile(path.join(runDir, "issues.json"), `${JSON.stringify(issues, null, 2)}\n`, "utf-8");

  const finishedAt = new Date().toISOString();
  const report = buildCanonicalReport({
    runId,
    startedAt: startedAtDate.toISOString(),
    finishedAt,
    inputs,
    page: extracted,
    issues,
  });

  await writeRunReports(runDir, report);

  return {
    runId,
    runDir,
    targetUrl: normalizedUrl,
    issues,
  };
}
