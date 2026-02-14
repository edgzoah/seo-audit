import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { loadConfig } from "../config/index.js";
import { crawlSite, discoverSeeds } from "../crawl/index.js";
import { extractPageData } from "../extract/index.js";
import { generateOptionalLlmProposals } from "../llm/index.js";
import type {
  Action,
  AuditInputs,
  CoverageMode,
  Issue,
  LighthouseMetrics,
  PageExtract,
  PerformanceSnapshot,
  RenderingMode,
  Report,
  ReportFormat,
} from "../report/report-schema.js";
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
  lighthouse?: boolean;
  focusInlinksThreshold?: number;
  serviceMinWords?: number;
  genericAnchors?: string;
  includeSerp?: boolean;
  onProgress?: (progress: AuditProgressEvent) => void;
}

interface ResolvedBriefFocus {
  briefText: string;
  primaryFocusUrl: string | null;
}

interface LighthouseRunResult {
  measured: boolean;
  metrics?: LighthouseMetrics;
}

export interface AuditProgressEvent {
  percent: number;
  stage: string;
  detail: string;
}

const GENERIC_ANCHORS = new Set<string>([
  "kliknij",
  "więcej",
  "zobacz",
  "czytaj",
  "tutaj",
  "sprawdź",
  "dowiedz się",
  "link",
  "przejdź",
  "read more",
  "learn more",
  "here",
  "more",
]);

const MAX_TOP_ANCHORS = 10;

function emitProgress(options: AuditCliOptions, percent: number, stage: string, detail: string): void {
  options.onProgress?.({
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    stage,
    detail,
  });
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function parseLighthouseOutput(raw: string): LighthouseMetrics | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const categories = (parsed.categories ?? {}) as Record<string, { score?: number }>;
    const audits = (parsed.audits ?? {}) as Record<string, { numericValue?: number }>;
    const lcpMs = typeof audits["largest-contentful-paint"]?.numericValue === "number" ? audits["largest-contentful-paint"]?.numericValue : undefined;
    const inpMs = typeof audits["interaction-to-next-paint"]?.numericValue === "number" ? audits["interaction-to-next-paint"]?.numericValue : undefined;
    const cls = typeof audits["cumulative-layout-shift"]?.numericValue === "number" ? audits["cumulative-layout-shift"]?.numericValue : undefined;
    const tbtMs = typeof audits["total-blocking-time"]?.numericValue === "number" ? audits["total-blocking-time"]?.numericValue : undefined;
    const scorePerf = typeof categories.performance?.score === "number" ? Math.round(categories.performance.score * 100) : undefined;
    const scoreA11y = typeof categories.accessibility?.score === "number" ? Math.round(categories.accessibility.score * 100) : undefined;
    const scoreSeo = typeof categories.seo?.score === "number" ? Math.round(categories.seo.score * 100) : undefined;
    const scoreBestPractices =
      typeof categories["best-practices"]?.score === "number" ? Math.round(categories["best-practices"].score * 100) : undefined;

    return {
      lcpMs,
      inpMs,
      cls,
      tbtMs,
      scorePerf,
      scoreA11y,
      scoreSeo,
      scoreBestPractices,
    };
  } catch {
    return null;
  }
}

async function runLighthouse(url: string, timeoutMs: number): Promise<LighthouseRunResult> {
  const commandPromise = new Promise<LighthouseRunResult>((resolve) => {
    const args = [
      url,
      "--quiet",
      "--output=json",
      "--output-path=stdout",
      "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
      "--only-categories=performance,accessibility,best-practices,seo",
    ];

    const child = spawn("lighthouse", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.on("error", () => {
      resolve({ measured: false });
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ measured: false });
        return;
      }
      const metrics = parseLighthouseOutput(stdout);
      if (!metrics) {
        resolve({ measured: false });
        return;
      }
      resolve({ measured: true, metrics });
    });
  });

  try {
    return await withTimeout(commandPromise, timeoutMs);
  } catch {
    return { measured: false };
  }
}

function toPerformanceSnapshot(result: LighthouseRunResult): PerformanceSnapshot {
  if (!result.measured || !result.metrics) {
    return {
      status: "not_measured",
      lcpMs: null,
      inpMs: null,
      cls: null,
      scorePerf: null,
    };
  }
  return {
    status: "measured",
    lcpMs: result.metrics.lcpMs ?? null,
    inpMs: result.metrics.inpMs ?? null,
    cls: result.metrics.cls ?? null,
    scorePerf: result.metrics.scorePerf ?? null,
  };
}

function normalizeAnchorValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function toPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 1000) / 10;
}

function sortAnchorsByCount(histogram: Map<string, number>, maxItems: number): Array<{ anchor: string; count: number }> {
  return Array.from(histogram.entries())
    .sort((a, b) => {
      const countDelta = b[1] - a[1];
      if (countDelta !== 0) {
        return countDelta;
      }
      return a[0].localeCompare(b[0], "en");
    })
    .slice(0, maxItems)
    .map(([anchor, count]) => ({ anchor, count }));
}

function isHomePage(url: string): boolean {
  try {
    return new URL(url).pathname === "/";
  } catch {
    return false;
  }
}

export interface InternalLinkGraphResult {
  pages: PageExtract[];
  focusInlinkUrls: Set<string>;
  focusInlinksCount: number;
  topInlinkSourcesToFocus: string[];
  focusAnchorQuality: {
    percentGenericAnchors: number;
    percentEmptyAnchors: number;
    topAnchors: Array<{ anchor: string; count: number }>;
  };
  internalLinksSummary: {
    orphanPagesCount: number;
    nearOrphanPagesCount: number;
    navLikelyInlinksPercent: number;
    percentGenericAnchors: number;
    percentEmptyAnchors: number;
    topAnchors: Array<{ anchor: string; count: number }>;
  };
}

export function buildInternalLinkGraph(pages: PageExtract[], focusUrl: string | null): InternalLinkGraphResult {
  const aliasToKey = new Map<string, string>();
  const inlinksByTarget = new Map<string, number>();
  const anchorsByTarget = new Map<string, Map<string, number>>();
  const inlinkSourceCountsToFocus = new Map<string, number>();
  const focusAnchorHistogram = new Map<string, number>();
  const globalAnchorHistogram = new Map<string, number>();

  let totalInternalOutlinks = 0;
  let totalNavLikelyOutlinks = 0;
  let totalGenericAnchors = 0;
  let totalEmptyAnchors = 0;
  let focusGenericAnchors = 0;
  let focusEmptyAnchors = 0;
  let focusTotalAnchors = 0;

  for (const page of pages) {
    const key = normalizeUrl(page.final_url) ?? page.final_url;
    aliasToKey.set(normalizeUrl(page.url) ?? page.url, key);
    aliasToKey.set(key, key);
  }

  const normalizedFocusUrl = focusUrl ? normalizeUrl(focusUrl) ?? focusUrl : null;

  for (const page of pages) {
    const sourceKey = normalizeUrl(page.final_url) ?? page.final_url;
    const sourceTargetSeen = new Set<string>();

    for (const link of page.outlinksInternal) {
      const normalizedTarget = normalizeUrl(link.targetUrl) ?? link.targetUrl;
      const targetKey = aliasToKey.get(normalizedTarget) ?? normalizedTarget;

      totalInternalOutlinks += 1;
      if (link.isNavLikely) {
        totalNavLikelyOutlinks += 1;
      }

      const normalizedAnchor = normalizeAnchorValue(link.anchorText);
      const isGenericAnchor = normalizedAnchor.length > 0 && GENERIC_ANCHORS.has(normalizedAnchor);
      const isEmptyAnchor = normalizedAnchor.length === 0;

      if (isGenericAnchor) {
        totalGenericAnchors += 1;
      }
      if (isEmptyAnchor) {
        totalEmptyAnchors += 1;
      }

      if (!anchorsByTarget.has(targetKey)) {
        anchorsByTarget.set(targetKey, new Map<string, number>());
      }
      const targetHistogram = anchorsByTarget.get(targetKey);
      if (targetHistogram) {
        targetHistogram.set(normalizedAnchor, (targetHistogram.get(normalizedAnchor) ?? 0) + 1);
      }

      const sourceTargetKey = `${sourceKey}\u0000${targetKey}`;
      const isFirstSourceTargetLink = !sourceTargetSeen.has(sourceTargetKey);
      if (isFirstSourceTargetLink) {
        inlinksByTarget.set(targetKey, (inlinksByTarget.get(targetKey) ?? 0) + 1);
        sourceTargetSeen.add(sourceTargetKey);
      }

      globalAnchorHistogram.set(normalizedAnchor, (globalAnchorHistogram.get(normalizedAnchor) ?? 0) + 1);

      if (normalizedFocusUrl && targetKey === normalizedFocusUrl) {
        if (isFirstSourceTargetLink) {
          inlinkSourceCountsToFocus.set(sourceKey, (inlinkSourceCountsToFocus.get(sourceKey) ?? 0) + 1);
        }
        focusAnchorHistogram.set(normalizedAnchor, (focusAnchorHistogram.get(normalizedAnchor) ?? 0) + 1);
        focusTotalAnchors += 1;
        if (isGenericAnchor) {
          focusGenericAnchors += 1;
        }
        if (isEmptyAnchor) {
          focusEmptyAnchors += 1;
        }
      }
    }
  }

  const pagesWithGraph = pages.map((page) => {
    const key = normalizeUrl(page.final_url) ?? page.final_url;
    const histogram = anchorsByTarget.get(key) ?? new Map<string, number>();
    return {
      ...page,
      inlinksCount: inlinksByTarget.get(key) ?? 0,
      inlinksAnchorsTop: sortAnchorsByCount(histogram, MAX_TOP_ANCHORS),
    };
  });

  const orphanPagesCount = pagesWithGraph.filter((page) => !isHomePage(page.final_url) && page.inlinksCount === 0).length;
  const nearOrphanPagesCount = pagesWithGraph.filter((page) => !isHomePage(page.final_url) && page.inlinksCount <= 1).length;

  const focusInlinkUrls = new Set<string>(Array.from(inlinkSourceCountsToFocus.keys()));
  const topInlinkSourcesToFocus = Array.from(inlinkSourceCountsToFocus.entries())
    .sort((a, b) => {
      const countDelta = b[1] - a[1];
      if (countDelta !== 0) {
        return countDelta;
      }
      return a[0].localeCompare(b[0], "en");
    })
    .slice(0, 10)
    .map(([url]) => url);

  return {
    pages: pagesWithGraph,
    focusInlinkUrls,
    focusInlinksCount: normalizedFocusUrl ? inlinksByTarget.get(normalizedFocusUrl) ?? 0 : 0,
    topInlinkSourcesToFocus,
    focusAnchorQuality: {
      percentGenericAnchors: toPercent(focusGenericAnchors, focusTotalAnchors),
      percentEmptyAnchors: toPercent(focusEmptyAnchors, focusTotalAnchors),
      topAnchors: sortAnchorsByCount(focusAnchorHistogram, MAX_TOP_ANCHORS),
    },
    internalLinksSummary: {
      orphanPagesCount,
      nearOrphanPagesCount,
      navLikelyInlinksPercent: toPercent(totalNavLikelyOutlinks, totalInternalOutlinks),
      percentGenericAnchors: toPercent(totalGenericAnchors, totalInternalOutlinks),
      percentEmptyAnchors: toPercent(totalEmptyAnchors, totalInternalOutlinks),
      topAnchors: sortAnchorsByCount(globalAnchorHistogram, MAX_TOP_ANCHORS),
    },
  };
}

function resolveInlinkUrls(pages: PageExtract[], focusUrl: string | null): Set<string> {
  if (!focusUrl) {
    return new Set<string>();
  }

  const normalizedFocusUrl = normalizeUrl(focusUrl) ?? focusUrl;
  const inlinks = new Set<string>();
  for (const page of pages) {
    for (const outlink of page.outlinksInternal) {
      const normalizedTarget = normalizeUrl(outlink.targetUrl) ?? outlink.targetUrl;
      if (normalizedTarget === normalizedFocusUrl) {
        inlinks.add(normalizeUrl(page.final_url) ?? page.final_url);
        break;
      }
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
  if (
    category === "seo" ||
    category === "indexability" ||
    category === "schema" ||
    category === "serp" ||
    category === "internal_links" ||
    category === "schema_quality" ||
    category === "indexation_conflicts"
  ) {
    return "seo";
  }
  if (category === "content" || category === "intent" || category === "content_quality" || category === "a11y") {
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
  const issueSpecificWeight =
    issue.id === "title_length_out_of_range" || issue.id === "description_length_out_of_range"
      ? 0.45
      : issue.id === "robots_meta_xrobots_conflict" || issue.id === "canonical_to_non_200"
        ? 1.35
        : issue.id === "focus_inlinks_count_low" || issue.id === "orphan_page" || issue.id === "near_orphan_page"
          ? 1.25
          : issue.id === "thin_content"
            ? 1.2
            : 1.0;
  const scale = 8;
  return severity * rank * volume * multiplier * issueSpecificWeight * scale;
}

function buildCategoryScores(issues: Issue[], performanceScore: number | null): Record<string, number> {
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
    performance: performanceScore === null ? 0 : clampScore(performanceScore),
  };
}

function buildFocusSummary(input: {
  issues: Issue[];
  focusUrl: string | null;
  inlinkUrls: Set<string>;
  pages: PageExtract[];
  focusInlinksCount: number;
  focusInlinksThreshold: number;
  performanceFocus: PerformanceSnapshot;
}): Report["summary"]["focus"] {
  if (!input.focusUrl) {
    return undefined;
  }

  const neighborhood = new Set<string>([input.focusUrl, ...Array.from(input.inlinkUrls)]);
  const focusNeighborhoodIssues = input.issues.filter((issue) => issue.affected_urls.some((url) => neighborhood.has(url)));
  const focusDeduction = focusNeighborhoodIssues.reduce((sum, issue) => sum + issueDeduction(issue), 0);
  const focusScore = clampScore(100 - focusDeduction);

  const focusTopIssues = [...focusNeighborhoodIssues]
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
  const focusPage = input.pages.find((page) => (normalizeUrl(page.final_url) ?? page.final_url) === input.focusUrl);
  const focusDirectIssues = input.issues.filter((issue) => issue.affected_urls.some((url) => url === input.focusUrl || url === focusPage?.url));
  const hasCriticalIndexationConflict = focusDirectIssues.some(
    (issue) =>
      (issue.category === "indexation_conflicts" || issue.category === "indexability") &&
      (issue.severity === "error" || issue.severity === "warning"),
  );
  const hasTitleH1Mismatch = focusDirectIssues.some((issue) => issue.id === "title_h1_mismatch");
  const hasThinContent = focusDirectIssues.some((issue) => issue.id === "thin_content");
  const inlinksOk = input.focusInlinksCount >= input.focusInlinksThreshold;
  const lighthouseMeasured = input.performanceFocus.status === "measured";
  const lighthouseGood =
    lighthouseMeasured &&
    (input.performanceFocus.lcpMs ?? Infinity) <= 2500 &&
    (input.performanceFocus.inpMs ?? Infinity) <= 200 &&
    (input.performanceFocus.cls ?? Infinity) <= 0.1;
  const upliftChecks = [!hasCriticalIndexationConflict, inlinksOk, !hasTitleH1Mismatch, !hasThinContent, !lighthouseMeasured || lighthouseGood];
  const focusUpliftScore = clampScore((upliftChecks.filter(Boolean).length / upliftChecks.length) * 100);

  return {
    primary_url: input.focusUrl,
    focus_score: focusScore,
    focus_uplift_score: focusUpliftScore,
    focus_top_issues: focusTopIssues,
    recommended_next_actions: recommendedNextActions,
    focusInlinksCount: 0,
    topInlinkSourcesToFocus: [],
    focusAnchorQuality: {
      percentGenericAnchors: 0,
      percentEmptyAnchors: 0,
      topAnchors: [],
    },
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

async function loadGenericAnchors(pathValue: string | undefined): Promise<string[] | null> {
  if (!pathValue) {
    return null;
  }
  const absolutePath = path.resolve(pathValue);
  const content = await readFile(absolutePath, "utf-8");
  const values = content
    .split(/\r?\n|,/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return values.length > 0 ? values : null;
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
  focusInlinksCount: number;
  topInlinkSourcesToFocus: string[];
  focusAnchorQuality: {
    percentGenericAnchors: number;
    percentEmptyAnchors: number;
    topAnchors: Array<{ anchor: string; count: number }>;
  };
  internalLinksSummary: {
    orphanPagesCount: number;
    nearOrphanPagesCount: number;
    navLikelyInlinksPercent: number;
    percentGenericAnchors: number;
    percentEmptyAnchors: number;
    topAnchors: Array<{ anchor: string; count: number }>;
  };
  focusInlinksThreshold: number;
  performanceFocus: PerformanceSnapshot;
  performanceHome: PerformanceSnapshot;
}): Report {
  const errors = input.issues.filter((issue) => issue.severity === "error").length;
  const warnings = input.issues.filter((issue) => issue.severity === "warning").length;
  const notices = input.issues.filter((issue) => issue.severity === "notice").length;

  const performanceScoreCandidates = [input.performanceFocus.scorePerf, input.performanceHome.scorePerf].filter(
    (value): value is number => typeof value === "number",
  );
  const performanceScore =
    performanceScoreCandidates.length > 0
      ? performanceScoreCandidates.reduce((sum, value) => sum + value, 0) / performanceScoreCandidates.length
      : null;
  const scoreByCategory = buildCategoryScores(input.issues, performanceScore);
  const totalDeduction = input.issues.reduce((sum, issue) => sum + issueDeduction(issue), 0);
  const scoreTotal = clampScore(100 - totalDeduction);
  const focusSummary = buildFocusSummary({
    issues: input.issues,
    focusUrl: input.focusUrl,
    inlinkUrls: input.inlinkUrls,
    pages: input.pages,
    focusInlinksCount: input.focusInlinksCount,
    focusInlinksThreshold: input.focusInlinksThreshold,
    performanceFocus: input.performanceFocus,
  });
  const focusSummaryWithGraph = focusSummary
    ? {
        ...focusSummary,
        focusInlinksCount: input.focusInlinksCount,
        topInlinkSourcesToFocus: input.topInlinkSourcesToFocus,
        focusAnchorQuality: input.focusAnchorQuality,
      }
    : undefined;

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
      focus: focusSummaryWithGraph,
      internal_links: input.internalLinksSummary,
      performanceFocus: input.performanceFocus,
      performanceHome: input.performanceHome,
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
  emitProgress(options, 2, "init", "Loading config");
  const startedAtDate = new Date();
  const normalizedUrl = new URL(target).toString();
  const config = await loadConfig();
  const resolvedBriefFocus = await resolveBriefFocus(normalizedUrl, options);
  const inputs = buildInputs(normalizedUrl, config.defaults, options, resolvedBriefFocus);

  const runId = buildRunId(startedAtDate);
  const runDir = path.join(process.cwd(), "runs", runId);
  await mkdir(runDir, { recursive: true });
  emitProgress(options, 6, "init", "Preparing run directory");

  await writeFile(path.join(runDir, "brief.md"), `${inputs.brief.text}\n`, "utf-8");
  await writeFile(path.join(runDir, "inputs.json"), `${JSON.stringify(inputs, null, 2)}\n`, "utf-8");

  emitProgress(options, 10, "seed", "Discovering seeds");
  const seedDiscovery = await discoverSeeds(inputs);
  await writeFile(path.join(runDir, "seed-discovery.json"), `${JSON.stringify(seedDiscovery, null, 2)}\n`, "utf-8");

  emitProgress(options, 14, "crawl", "Crawling pages");
  const crawl = await crawlSite(inputs, seedDiscovery.seeds, (progress) => {
    const crawlProgress = progress.crawlLimit > 0 ? Math.min(1, progress.pagesFetched / progress.crawlLimit) : 0;
    const mappedPercent = 14 + crawlProgress * 28;
    emitProgress(options, mappedPercent, "crawl", `${progress.pagesFetched}/${progress.crawlLimit} pages`);
  });
  const crawlJsonl = crawl.events.map((event) => JSON.stringify(event)).join("\n");
  await writeFile(path.join(runDir, "crawl.jsonl"), crawlJsonl.length > 0 ? `${crawlJsonl}\n` : "", "utf-8");

  if (crawl.pages.length === 0) {
    throw new Error("Crawl did not return any fetchable pages.");
  }

  emitProgress(options, 45, "extract", "Extracting page data");
  const extractedPages = crawl.pages.map((page) =>
    extractPageData(page.html, page.url, page.final_url, page.status, page.response_headers),
  );
  const normalizedFocusUrl = normalizeUrl(inputs.brief.focus.primary_url, inputs.target);
  const graph = buildInternalLinkGraph(extractedPages, normalizedFocusUrl);
  let graphEnrichedPages = graph.pages;
  const homeUrl = new URL("/", inputs.target).toString();
  const shouldMeasureLighthouse = Boolean(options.lighthouse);
  let focusLighthouse: LighthouseRunResult = { measured: false };
  let homeLighthouse: LighthouseRunResult = { measured: false };
  if (shouldMeasureLighthouse) {
    emitProgress(options, 54, "lighthouse", "Running Lighthouse checks");
    [focusLighthouse, homeLighthouse] = await Promise.all([
      normalizedFocusUrl ? runLighthouse(normalizedFocusUrl, inputs.timeout_ms * 2) : Promise.resolve({ measured: false }),
      runLighthouse(homeUrl, inputs.timeout_ms * 2),
    ]);
  }

  const measuredByUrl = new Map<string, LighthouseMetrics>();
  if (normalizedFocusUrl && focusLighthouse.measured && focusLighthouse.metrics) {
    measuredByUrl.set(normalizedFocusUrl, focusLighthouse.metrics);
  }
  if (homeLighthouse.measured && homeLighthouse.metrics) {
    measuredByUrl.set(homeUrl, homeLighthouse.metrics);
  }

  graphEnrichedPages = graphEnrichedPages.map((page) => {
    const pageNormalized = normalizeUrl(page.final_url) ?? page.final_url;
    const lighthouse = measuredByUrl.get(pageNormalized);
    return lighthouse ? { ...page, lighthouse } : page;
  });

  const sitemapSeedUrls = seedDiscovery.discovered
    .filter((entry) => entry.source !== "start_url")
    .map((entry) => entry.url);
  const genericAnchors = await loadGenericAnchors(options.genericAnchors);
  emitProgress(options, 62, "rules", "Running deterministic rules");
  const baseIssues = await runRules({
    pages: graphEnrichedPages,
    robotsDisallow: seedDiscovery.robots_disallow,
    timeoutMs: inputs.timeout_ms,
    focusUrl: normalizedFocusUrl,
    sitemapUrls: sitemapSeedUrls,
    focusInlinksThreshold: options.focusInlinksThreshold ?? 5,
    serviceMinWords: options.serviceMinWords ?? 300,
    defaultMinWords: 150,
    genericAnchors,
    includeSerp: options.includeSerp ?? true,
  });
  const focusUrl = normalizedFocusUrl;
  const inlinkUrls = graph.focusInlinkUrls.size > 0 ? graph.focusInlinkUrls : resolveInlinkUrls(graphEnrichedPages, focusUrl);
  const issues = applyFocusTags({ issues: baseIssues, focusUrl, inlinkUrls });

  emitProgress(options, 78, "report", "Writing artifacts");
  await writeFile(path.join(runDir, "pages.json"), `${JSON.stringify(graphEnrichedPages, null, 2)}\n`, "utf-8");
  await writeFile(path.join(runDir, "issues.json"), `${JSON.stringify(issues, null, 2)}\n`, "utf-8");

  const finishedAt = new Date().toISOString();
  const report = buildCanonicalReport({
    runId,
    startedAt: startedAtDate.toISOString(),
    finishedAt,
    inputs,
    pages: graphEnrichedPages,
    issues,
    focusUrl,
    inlinkUrls,
    focusInlinksCount: graph.focusInlinksCount,
    topInlinkSourcesToFocus: graph.topInlinkSourcesToFocus,
    focusAnchorQuality: graph.focusAnchorQuality,
    internalLinksSummary: graph.internalLinksSummary,
    focusInlinksThreshold: options.focusInlinksThreshold ?? 5,
    performanceFocus: toPerformanceSnapshot(focusLighthouse),
    performanceHome: toPerformanceSnapshot(homeLighthouse),
  });

  if (inputs.llm_enabled) {
    emitProgress(options, 86, "llm", "Generating LLM proposals");
    const llmOutput = await generateOptionalLlmProposals({
      runDir,
      report,
    });
    if (llmOutput) {
      report.proposed_fixes = llmOutput.proposed_fixes;
      report.prioritized_actions = llmOutput.prioritized_actions;
      report.proposed_packs = llmOutput.proposed_packs;
    }
  }

  emitProgress(options, 94, "report", "Rendering report files");
  await writeRunReports(runDir, report);

  if (inputs.baseline_run_id) {
    emitProgress(options, 97, "diff", "Generating diff artifacts");
    const baselineReport = await loadReportFromRun(inputs.baseline_run_id);
    await writeRunDiffArtifacts(runDir, baselineReport, report);
  }

  emitProgress(options, 100, "done", "Completed");

  return {
    runId,
    runDir,
    targetUrl: normalizedUrl,
    issues,
  };
}
