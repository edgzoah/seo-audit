import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "../config/index.js";
import { extractPageData } from "../extract/index.js";
import type { AuditInputs, CoverageMode, Issue, PageExtract, RenderingMode, Report, ReportFormat } from "../report/report-schema.js";
import { writeRunReports } from "../report/index.js";
import { runRules } from "../rules/index.js";

export interface AuditRunResult {
  runId: string;
  runDir: string;
  targetUrl: string;
  issues: Issue[];
}

export interface AuditCliOptions {
  coverage?: CoverageMode;
  maxPages?: number;
  depth?: number;
  format?: ReportFormat;
  refresh?: boolean;
  headless?: boolean;
  robots?: boolean;
  llm?: boolean;
  baseline?: string;
  brief?: string;
  focusUrl?: string;
  focusKeyword?: string;
  focusGoal?: string;
  constraints?: string;
}

function buildRunId(now: Date = new Date()): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  return `run-${iso}`;
}

function parseConstraints(rawConstraints: string | undefined): string[] {
  if (!rawConstraints) {
    return [];
  }

  return rawConstraints
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function readBriefText(briefPath: string | undefined): Promise<string> {
  if (!briefPath) {
    return "";
  }

  const absolutePath = path.resolve(briefPath);
  const content = await readFile(absolutePath, "utf-8");
  return content.trim();
}

function buildInputs(
  targetUrl: string,
  defaults: Awaited<ReturnType<typeof loadConfig>>["defaults"],
  options: AuditCliOptions,
  briefText: string,
): AuditInputs {
  const renderingMode: RenderingMode = options.headless ? "headless" : defaults.rendering_mode;
  const constraints = parseConstraints(options.constraints);

  return {
    target_type: "url",
    target: targetUrl,
    coverage: options.coverage ?? defaults.coverage,
    max_pages: options.maxPages ?? defaults.max_pages,
    crawl_depth: options.depth ?? defaults.crawl_depth,
    include_patterns: defaults.include_patterns,
    exclude_patterns: defaults.exclude_patterns,
    allowed_domains: defaults.allowed_domains,
    respect_robots: options.robots ?? defaults.respect_robots,
    rendering_mode: renderingMode,
    user_agent: defaults.user_agent,
    timeout_ms: defaults.timeout_ms,
    locale: defaults.locale,
    report_format: options.format ?? defaults.report_format,
    llm_enabled: options.llm ?? defaults.llm_enabled,
    baseline_run_id: options.baseline ?? null,
    brief: {
      text: briefText,
      focus: {
        primary_url: options.focusUrl ?? null,
        primary_keyword: options.focusKeyword ?? null,
        goal: options.focusGoal ?? null,
        current_position: null,
        secondary_urls: [],
      },
      constraints,
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

export async function runAuditCommand(target: string, options: AuditCliOptions = {}): Promise<AuditRunResult> {
  const startedAtDate = new Date();
  const normalizedUrl = new URL(target).toString();
  const config = await loadConfig();
  const briefText = await readBriefText(options.brief);
  const inputs = buildInputs(normalizedUrl, config.defaults, options, briefText);

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
