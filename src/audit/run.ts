import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "../config/index.js";
import { crawlSite, discoverSeeds } from "../crawl/index.js";
import { extractPageData } from "../extract/index.js";
import { generateOptionalLlmProposals } from "../llm/index.js";
import type { Action, AuditInputs, CoverageMode, Issue, PageExtract, RenderingMode, Report, ReportFormat } from "../report/report-schema.js";
import { loadReportFromRun, writeRunDiffArtifacts, writeRunReports } from "../report/index.js";
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

interface ResolvedBriefFocus {
  briefText: string;
  primaryFocusUrl: string | null;
}

function normalizeUrl(raw: string | null, baseUrl?: string): string | null {
  if (!raw) {
    return null;
  }

  try {
    return baseUrl ? new URL(raw, baseUrl).toString() : new URL(raw).toString();
  } catch {
    return null;
  }
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "en"));
}

function resolveInlinkUrls(pages: PageExtract[], focusUrl: string | null): Set<string> {
  if (!focusUrl) {
    return new Set<string>();
  }

  const inlinks = new Set<string>();
  for (const page of pages) {
    if (page.links.internal_targets.includes(focusUrl)) {
      inlinks.add(page.url);
    }
  }
  return inlinks;
}

function applyFocusTags(input: { issues: Issue[]; focusUrl: string | null; inlinkUrls: Set<string> }): Issue[] {
  return input.issues.map((issue) => {
    const hasFocus = input.focusUrl ? issue.affected_urls.some((url) => url === input.focusUrl) : false;
    const hasInlink = issue.affected_urls.some((url) => input.inlinkUrls.has(url));

    const tags: string[] = [];
    if (hasFocus) {
      tags.push("focus");
    }
    if (hasInlink) {
      tags.push("inlink");
    }
    if (tags.length === 0) {
      tags.push("global");
    }

    return {
      ...issue,
      tags: uniqueSorted(tags),
    };
  });
}

function getIssueWeight(issue: Issue): number {
  if (issue.tags.includes("focus")) {
    return 2.0;
  }
  if (issue.tags.includes("inlink")) {
    return 1.3;
  }
  return 1.0;
}

function clampScore(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return Math.round(value * 10) / 10;
}

function severityWeight(severity: Issue["severity"]): number {
  switch (severity) {
    case "error":
      return 1.0;
    case "warning":
      return 0.7;
    case "notice":
      return 0.4;
    default:
      return 0.4;
  }
}

function categoryToScoreBucket(category: string): "seo" | "technical" | "content" | "security" | "performance" {
  if (category === "seo" || category === "indexability" || category === "schema") {
    return "seo";
  }
  if (category === "content") {
    return "content";
  }
  if (category === "security") {
    return "security";
  }
  if (category === "technical") {
    return "technical";
  }
  return "technical";
}

function issueDeduction(issue: Issue): number {
  const affectedCount = Math.max(1, issue.affected_urls.length);
  const severity = severityWeight(issue.severity);
  const rank = Math.max(1, Math.min(10, issue.rank)) / 10;
  const volume = Math.log(1 + affectedCount);
  const multiplier = getIssueWeight(issue);
  const scale = 8;
  return severity * rank * volume * multiplier * scale;
}

function buildCategoryScores(issues: Issue[]): Record<string, number> {
  const deductions: Record<string, number> = {
    seo: 0,
    technical: 0,
    content: 0,
    security: 0,
    performance: 0,
  };

  for (const issue of issues) {
    const bucket = categoryToScoreBucket(issue.category);
    deductions[bucket] += issueDeduction(issue);
  }

  return {
    seo: clampScore(100 - deductions.seo),
    technical: clampScore(100 - deductions.technical),
    content: clampScore(100 - deductions.content),
    security: clampScore(100 - deductions.security),
    performance: 100,
  };
}

function buildFocusSummary(input: { issues: Issue[]; focusUrl: string | null; inlinkUrls: Set<string> }): Report["summary"]["focus"] {
  if (!input.focusUrl) {
    return undefined;
  }

  const neighborhood = new Set<string>([input.focusUrl, ...Array.from(input.inlinkUrls)]);
  const focusIssues = input.issues.filter((issue) => issue.affected_urls.some((url) => neighborhood.has(url)));
  const focusDeduction = focusIssues.reduce((sum, issue) => sum + issueDeduction(issue), 0);
  const focusScore = clampScore(100 - focusDeduction);

  const focusTopIssues = [...focusIssues]
    .sort((a, b) => {
      const delta = issueDeduction(b) - issueDeduction(a);
      if (delta !== 0) {
        return delta;
      }
      return a.id.localeCompare(b.id, "en");
    })
    .map((issue) => issue.id)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 5);

  const recommendedNextActions: Action[] = [];

  return {
    primary_url: input.focusUrl,
    focus_score: focusScore,
    focus_top_issues: focusTopIssues,
    recommended_next_actions: recommendedNextActions,
  };
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

function extractFocusUrlFromBrief(briefText: string): string | null {
  const patterns = [/^\s*focus\s+on\s*:\s*(\S+)/im, /^\s*focus\s+on\s+(\S+)/im];

  for (const pattern of patterns) {
    const match = briefText.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function normalizeFocusUrl(value: string | null, targetUrl: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    if (trimmed.startsWith("/")) {
      return new URL(trimmed, targetUrl).toString();
    }
    return trimmed;
  }
}

async function resolveBriefFocus(targetUrl: string, options: AuditCliOptions): Promise<ResolvedBriefFocus> {
  const briefText = await readBriefText(options.brief);
  const focusCandidate = options.focusUrl ?? extractFocusUrlFromBrief(briefText);
  const primaryFocusUrl = normalizeFocusUrl(focusCandidate, targetUrl);

  return {
    briefText,
    primaryFocusUrl,
  };
}

function buildInputs(
  targetUrl: string,
  defaults: Awaited<ReturnType<typeof loadConfig>>["defaults"],
  options: AuditCliOptions,
  resolved: ResolvedBriefFocus,
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
      text: resolved.briefText,
      focus: {
        primary_url: resolved.primaryFocusUrl,
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
  pages: PageExtract[];
  issues: Issue[];
  focusUrl: string | null;
  inlinkUrls: Set<string>;
}): Report {
  const errors = input.issues.filter((issue) => issue.severity === "error").length;
  const warnings = input.issues.filter((issue) => issue.severity === "warning").length;
  const notices = input.issues.filter((issue) => issue.severity === "notice").length;

  const scoreByCategory = buildCategoryScores(input.issues);
  const totalDeduction = input.issues.reduce((sum, issue) => sum + issueDeduction(issue), 0);
  const scoreTotal = clampScore(100 - totalDeduction);
  const focusSummary = buildFocusSummary({
    issues: input.issues,
    focusUrl: input.focusUrl,
    inlinkUrls: input.inlinkUrls,
  });

  return {
    run_id: input.runId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    inputs: input.inputs,
    summary: {
      score_total: scoreTotal,
      score_by_category: scoreByCategory,
      pages_crawled: input.pages.length,
      errors,
      warnings,
      notices,
      focus: focusSummary,
    },
    issues: input.issues,
    pages: input.pages.map((page) => ({
      url: page.url,
      final_url: page.final_url,
      status: page.status,
      title: page.title,
      canonical: page.canonical,
    })),
    page_extracts: input.pages,
  };
}

export async function runAuditCommand(target: string, options: AuditCliOptions = {}): Promise<AuditRunResult> {
  const startedAtDate = new Date();
  const normalizedUrl = new URL(target).toString();
  const config = await loadConfig();
  const resolvedBriefFocus = await resolveBriefFocus(normalizedUrl, options);
  const inputs = buildInputs(normalizedUrl, config.defaults, options, resolvedBriefFocus);

  const runId = buildRunId(startedAtDate);
  const runDir = path.join(process.cwd(), "runs", runId);
  await mkdir(runDir, { recursive: true });

  await writeFile(path.join(runDir, "brief.md"), `${inputs.brief.text}\n`, "utf-8");
  await writeFile(path.join(runDir, "inputs.json"), `${JSON.stringify(inputs, null, 2)}\n`, "utf-8");

  const seedDiscovery = await discoverSeeds(inputs);
  await writeFile(path.join(runDir, "seed-discovery.json"), `${JSON.stringify(seedDiscovery, null, 2)}\n`, "utf-8");

  const crawl = await crawlSite(inputs, seedDiscovery.seeds);
  const crawlJsonl = crawl.events.map((event) => JSON.stringify(event)).join("\n");
  await writeFile(path.join(runDir, "crawl.jsonl"), crawlJsonl.length > 0 ? `${crawlJsonl}\n` : "", "utf-8");

  if (crawl.pages.length === 0) {
    throw new Error("Crawl did not return any fetchable pages.");
  }

  const extractedPages = crawl.pages.map((page) =>
    extractPageData(page.html, page.url, page.final_url, page.status, page.response_headers),
  );
  const baseIssues = await runRules({
    pages: extractedPages,
    robotsDisallow: seedDiscovery.robots_disallow,
    timeoutMs: inputs.timeout_ms,
  });
  const focusUrl = normalizeUrl(inputs.brief.focus.primary_url, inputs.target);
  const inlinkUrls = resolveInlinkUrls(extractedPages, focusUrl);
  const issues = applyFocusTags({ issues: baseIssues, focusUrl, inlinkUrls });

  await writeFile(path.join(runDir, "pages.json"), `${JSON.stringify(extractedPages, null, 2)}\n`, "utf-8");
  await writeFile(path.join(runDir, "issues.json"), `${JSON.stringify(issues, null, 2)}\n`, "utf-8");

  const finishedAt = new Date().toISOString();
  const report = buildCanonicalReport({
    runId,
    startedAt: startedAtDate.toISOString(),
    finishedAt,
    inputs,
    pages: extractedPages,
    issues,
    focusUrl,
    inlinkUrls,
  });

  if (inputs.llm_enabled) {
    const llmOutput = await generateOptionalLlmProposals({
      runDir,
      report,
    });
    if (llmOutput) {
      report.proposed_fixes = llmOutput.proposed_fixes;
      report.prioritized_actions = llmOutput.prioritized_actions;
    }
  }

  await writeRunReports(runDir, report);

  if (inputs.baseline_run_id) {
    const baselineReport = await loadReportFromRun(inputs.baseline_run_id);
    await writeRunDiffArtifacts(runDir, baselineReport, report);
  }

  return {
    runId,
    runDir,
    targetUrl: normalizedUrl,
    issues,
  };
}
