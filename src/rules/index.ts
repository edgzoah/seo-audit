import type { Evidence, Issue, IssueSeverity, PageExtract } from "../report/report-schema.js";

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  error: 3,
  warning: 2,
  notice: 1,
};

interface RuleContext {
  pages: PageExtract[];
  robotsDisallow: string[];
  timeoutMs: number;
  focusUrl: string | null;
  sitemapUrls: string[];
  focusInlinksThreshold: number;
  serviceMinWords: number;
  defaultMinWords: number;
  genericAnchors: string[] | null;
  includeSerp: boolean;
}

interface IssueInput {
  id: string;
  category: string;
  severity: IssueSeverity;
  rank: number;
  title: string;
  description: string;
  affectedUrls: string[];
  evidence: Evidence[];
  recommendation: string;
}

interface LinkFailureEvidence {
  sourceUrl: string;
  targetUrl: string;
  status: number | null;
  error: string | null;
}

interface AnchorStats {
  total: number;
  generic: number;
  empty: number;
  navLikely: number;
}

const DEFAULT_GENERIC_ANCHORS = new Set<string>([
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

const SECTION_KEYWORDS = {
  forWho: ["dla kogo", "kiedy", "wskazania"],
  process: ["jak wygląda", "przebieg", "etapy"],
  pricingOrLogistics: ["cennik", "koszt", "czas", "umów", "rezerwacja"],
  faq: ["faq", "pytania", "?"],
} as const;

const HTTP_STATUS_CONCURRENCY = 12;
const REDIRECT_CHAIN_CONCURRENCY = 8;

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort(compareStrings);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function normalizeText(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeForCompare(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string | null): Set<string> {
  const normalized = normalizeForCompare(value);
  if (normalized.length === 0) {
    return new Set<string>();
  }
  return new Set(normalized.split(" ").filter((token) => token.length >= 2));
}

function jaccardSimilarity(a: string | null, b: string | null): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function parseRobotsDirectives(value: string | null): Set<string> {
  if (!value) {
    return new Set<string>();
  }
  return new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0),
  );
}

function parseNoindexFromHeader(value: string | null): boolean {
  if (!value) {
    return false;
  }
  return /(^|[\s,;])noindex([\s,;]|$)/i.test(value);
}

function isServiceLocalPage(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return pathname.includes("/psychoterapia/") || pathname.includes("/psychiatria/") || pathname.includes("/terapia-");
}

function hasAnyKeyword(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}

function extractTextChunks(mainText: string): string[] {
  return mainText
    .split(/\n{2,}|(?<=[.?!])\s+/)
    .map((chunk) => normalizeForCompare(chunk))
    .filter((chunk) => chunk.length >= 80);
}

function countTopKeywordRepeat(text: string): { topToken: string; count: number; ratio: number } {
  const tokens = normalizeForCompare(text)
    .split(" ")
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) {
    return { topToken: "", count: 0, ratio: 0 };
  }

  const histogram = new Map<string, number>();
  for (const token of tokens) {
    histogram.set(token, (histogram.get(token) ?? 0) + 1);
  }

  let topToken = "";
  let topCount = 0;
  for (const [token, count] of histogram.entries()) {
    if (count > topCount || (count === topCount && token.localeCompare(topToken, "en") < 0)) {
      topToken = token;
      topCount = count;
    }
  }

  return {
    topToken,
    count: topCount,
    ratio: topCount / tokens.length,
  };
}

function isGenericImageAlt(alt: string): boolean {
  const normalized = normalizeForCompare(alt);
  if (normalized.length < 4) {
    return true;
  }
  return ["image", "zdjęcie", "photo", "banner", "grafika"].includes(normalized);
}

function collectSchemaObjects(parsed: Record<string, unknown>[]): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    output.push(record);
    if (record["@graph"]) {
      walk(record["@graph"]);
    }
  };

  for (const item of parsed) {
    walk(item);
  }
  return output;
}

function hasSchemaType(record: Record<string, unknown>, expected: string): boolean {
  const atType = record["@type"];
  if (typeof atType === "string") {
    return atType === expected;
  }
  if (Array.isArray(atType)) {
    return atType.some((value) => value === expected);
  }
  return false;
}

function safeUrl(baseUrl: string, raw: string): string | null {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string): string | null {
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function createIssue(input: IssueInput): Issue {
  return {
    id: input.id,
    category: input.category,
    severity: input.severity,
    rank: input.rank,
    title: input.title,
    description: input.description,
    affected_urls: uniqueSorted(input.affectedUrls),
    evidence: input.evidence,
    recommendation: input.recommendation,
    tags: ["global"],
  };
}

export function sortIssuesDeterministic(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const severityDelta = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const rankDelta = b.rank - a.rank;
    if (rankDelta !== 0) {
      return rankDelta;
    }

    const idDelta = a.id.localeCompare(b.id, "en");
    if (idDelta !== 0) {
      return idDelta;
    }

    const aUrl = a.affected_urls[0] ?? "";
    const bUrl = b.affected_urls[0] ?? "";
    return aUrl.localeCompare(bUrl, "en");
  });
}

function buildStatusMap(pages: PageExtract[]): Map<string, number> {
  const statusByUrl = new Map<string, number>();
  for (const page of pages) {
    statusByUrl.set(page.url, page.status);
    statusByUrl.set(page.final_url, page.status);
  }
  return statusByUrl;
}

function parseMetaNoindex(metaRobots: string | null): boolean {
  return Boolean(metaRobots && /(^|[\s,])noindex([\s,]|$)/i.test(metaRobots));
}

function hasHeadingSkip(page: PageExtract): boolean {
  const levels = page.headings_outline.map((item) => item.level);
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) {
      return true;
    }
  }
  return false;
}

function looksIndexable(page: PageExtract): boolean {
  return !parseMetaNoindex(page.meta_robots);
}

function isBlockedByRobots(pageUrl: string, rules: string[]): boolean {
  if (rules.length === 0) {
    return false;
  }
  try {
    const pathname = new URL(pageUrl).pathname;
    return rules.some((rule) => pathname.startsWith(rule));
  } catch {
    return false;
  }
}

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function createSinglePageIssue(page: PageExtract, input: Omit<IssueInput, "affectedUrls">): Issue {
  return createIssue({
    ...input,
    affectedUrls: [page.url],
  });
}

function buildInlinkAnchorStats(pages: PageExtract[], genericAnchors: Set<string>): Map<string, AnchorStats> {
  const statsByTarget = new Map<string, AnchorStats>();

  for (const page of pages) {
    for (const link of page.outlinksInternal) {
      const key = normalizeUrl(link.targetUrl) ?? link.targetUrl;
      const anchor = normalizeForCompare(link.anchorText);
      const stats = statsByTarget.get(key) ?? { total: 0, generic: 0, empty: 0, navLikely: 0 };
      stats.total += 1;
      if (anchor.length === 0) {
        stats.empty += 1;
      }
      if (anchor.length > 0 && genericAnchors.has(anchor)) {
        stats.generic += 1;
      }
      if (link.isNavLikely) {
        stats.navLikely += 1;
      }
      statsByTarget.set(key, stats);
    }
  }

  return statsByTarget;
}

function collectDuplicateFieldIssues(input: {
  pages: PageExtract[];
  fieldName: "title" | "description";
  valueByPage: (page: PageExtract) => string | null;
  issueId: "duplicate_title" | "duplicate_description" | "meta_description_duplicate";
  category: string;
  severity: IssueSeverity;
  rank: number;
  title: string;
  description: string;
  recommendation: string;
}): Issue[] {
  const map = new Map<string, string[]>();
  for (const page of input.pages) {
    const normalized = normalizeText(input.valueByPage(page));
    if (!normalized) {
      continue;
    }
    const urls = map.get(normalized) ?? [];
    urls.push(page.url);
    map.set(normalized, urls);
  }

  const issues: Issue[] = [];
  for (const [value, urls] of Array.from(map.entries()).sort((a, b) => compareStrings(a[0], b[0]))) {
    const uniqueUrls = uniqueSorted(urls);
    if (uniqueUrls.length < 2) {
      continue;
    }
    issues.push(
      createIssue({
        id: input.issueId,
        category: input.category,
        severity: input.severity,
        rank: input.rank,
        title: input.title,
        description: input.description,
        affectedUrls: uniqueUrls,
        evidence: [
          {
            type: "content",
            message: `Duplicate ${input.fieldName} found on ${uniqueUrls.length} pages.`,
            details: {
              duplicate_value: value,
            },
          },
        ],
        recommendation: input.recommendation,
      }),
    );
  }

  return issues;
}

async function fetchStatusWithFallback(url: string, timeoutMs: number): Promise<{ status: number | null; error: string | null }> {
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (headResponse.ok || (headResponse.status >= 300 && headResponse.status < 600)) {
      return { status: headResponse.status, error: null };
    }
  } catch {
    // fallback to GET
  }

  try {
    const getResponse = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: getResponse.status, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: null, error: message };
  }
}

function createSharedStatusResolver(timeoutMs: number): (url: string) => Promise<{ status: number | null; error: string | null }> {
  const cache = new Map<string, Promise<{ status: number | null; error: string | null }>>();

  return async (url: string) => {
    if (!cache.has(url)) {
      cache.set(url, fetchStatusWithFallback(url, timeoutMs));
    }
    return await (cache.get(url) as Promise<{ status: number | null; error: string | null }>);
  };
}

async function collectBrokenLinkEvidence(input: {
  pages: PageExtract[];
  internal: boolean;
  robotsRules: string[];
  resolveStatus: (url: string) => Promise<{ status: number | null; error: string | null }>;
}): Promise<LinkFailureEvidence[]> {
  const failures: LinkFailureEvidence[] = [];
  const statusByUrl = buildStatusMap(input.pages);
  const remoteChecks: Array<{ sourceUrl: string; targetUrl: string }> = [];

  for (const page of input.pages) {
    const targets = input.internal ? page.links.internal_targets : page.links.external_targets;
    for (const target of targets) {
      if (!isHttpOrHttpsUrl(target)) {
        continue;
      }

      if (isBlockedByRobots(target, input.robotsRules)) {
        continue;
      }

      if (input.internal && statusByUrl.has(target)) {
        const status = statusByUrl.get(target) ?? null;
        if (status !== null && status < 400) {
          continue;
        }
        failures.push({
          sourceUrl: page.url,
          targetUrl: target,
          status,
          error: status === null ? "unknown status" : null,
        });
        continue;
      }

      remoteChecks.push({
        sourceUrl: page.url,
        targetUrl: target,
      });
    }
  }

  const checkedFailures = await mapWithConcurrency(remoteChecks, HTTP_STATUS_CONCURRENCY, async (check) => {
    const result = await input.resolveStatus(check.targetUrl);
    if (result.status !== null && result.status < 400) {
      return null;
    }
    return {
      sourceUrl: check.sourceUrl,
      targetUrl: check.targetUrl,
      status: result.status,
      error: result.error,
    } satisfies LinkFailureEvidence;
  });
  failures.push(...checkedFailures.filter((item): item is LinkFailureEvidence => Boolean(item)));

  return failures.sort((a, b) => {
    const sourceDelta = compareStrings(a.sourceUrl, b.sourceUrl);
    if (sourceDelta !== 0) {
      return sourceDelta;
    }
    return compareStrings(a.targetUrl, b.targetUrl);
  });
}

async function getRedirectChainLength(url: string, timeoutMs: number, maxHops = 8): Promise<number> {
  let hops = 0;
  let current = url;
  const seen = new Set<string>();

  while (hops < maxHops && !seen.has(current)) {
    seen.add(current);
    try {
      const response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status < 300 || response.status >= 400) {
        return hops;
      }

      const location = response.headers.get("location");
      if (!location) {
        return hops;
      }
      const next = safeUrl(current, location);
      if (!next) {
        return hops;
      }
      current = next;
      hops += 1;
    } catch {
      return hops;
    }
  }

  return hops;
}

export async function runRules(context: RuleContext): Promise<Issue[]> {
  const issues: Issue[] = [];
  const pages = context.pages;
  const auditablePages = pages.filter((page) => page.status >= 200 && page.status < 300);
  const statusByUrl = buildStatusMap(pages);
  const resolveStatus = createSharedStatusResolver(context.timeoutMs);
  const genericAnchors = new Set((context.genericAnchors ?? Array.from(DEFAULT_GENERIC_ANCHORS)).map((item) => normalizeForCompare(item)));
  const inlinkAnchorStatsByTarget = buildInlinkAnchorStats(pages, genericAnchors);
  const normalizedFocusUrl = context.focusUrl ? normalizeUrl(context.focusUrl) ?? context.focusUrl : null;

  for (const page of pages) {
    const isOnPageAuditable = page.status >= 200 && page.status < 300;
    const titleLength = page.title?.trim().length ?? 0;
    const descriptionLength = page.meta_description?.trim().length ?? 0;
    const h1Count = page.headings_outline.filter((heading) => heading.level === 1).length;
    const canonicalNormalized = page.canonical ? safeUrl(page.final_url, page.canonical) ?? page.canonical : null;
    const h1Text = page.headings_outline.find((heading) => heading.level === 1)?.text ?? "";
    const titleH1Similarity = jaccardSimilarity(page.titleText || page.title, h1Text);
    const firstTwoHeadings = page.headings_outline.slice(0, 2).map((item) => item.text);
    const headingDupSimilarity =
      firstTwoHeadings.length === 2 ? jaccardSimilarity(firstTwoHeadings[0] ?? null, firstTwoHeadings[1] ?? null) : 0;
    const noindexMeta = parseMetaNoindex(page.metaRobotsContent || page.meta_robots);
    const noindexHeader = parseNoindexFromHeader(page.xRobotsTagHeader);
    const anchorStats = inlinkAnchorStatsByTarget.get(normalizeUrl(page.final_url) ?? page.final_url) ?? {
      total: 0,
      generic: 0,
      empty: 0,
      navLikely: 0,
    };

    if (!isOnPageAuditable) {
      issues.push(
        createSinglePageIssue(page, {
          id: "page_not_available",
          category: "indexability",
          severity: "warning",
          rank: 8,
          title: "Page is not available for indexing",
          description: "URL returned a non-2xx status, so on-page SEO checks were skipped.",
          evidence: [
            {
              type: "http",
              message: `Status code is ${page.status}.`,
              url: page.url,
            },
          ],
          recommendation:
            "If this URL should rank, restore it with HTTP 200. If removed intentionally, update internal links/sitemap/canonicals to point to active pages.",
        }),
      );
      continue;
    }

    if (isOnPageAuditable) {
      if (context.includeSerp && h1Text.length > 0 && page.titleText.length > 0 && titleH1Similarity < 0.25) {
        issues.push(
          createSinglePageIssue(page, {
            id: "title_h1_mismatch",
            category: "serp",
            severity: "warning",
            rank: 6,
            title: "Title and H1 semantic mismatch",
            description: "Title and H1 likely target different intent/topic.",
            evidence: [
              {
                type: "content",
                message: `Similarity score: ${Math.round(titleH1Similarity * 100)}%.`,
                url: page.url,
                details: { title: page.titleText, h1: h1Text },
              },
            ],
            recommendation: "Align <title> and H1 around the same primary intent and phrasing.",
          }),
        );
      }

      if (context.includeSerp && (h1Count > 1 || headingDupSimilarity >= 0.85)) {
        issues.push(
          createSinglePageIssue(page, {
            id: "title_overwrite_risk",
            category: "serp",
            severity: "notice",
            rank: 3,
            title: "Potential title rewrite risk",
            description: "Heading structure may increase risk of search snippet title rewrite.",
            evidence: [
              {
                type: "content",
                message:
                  h1Count > 1 ? `Detected ${h1Count} H1 headings.` : `First heading similarity is ${Math.round(headingDupSimilarity * 100)}%.`,
                url: page.url,
              },
            ],
            recommendation: "Use one clear H1 and reduce near-duplicate heading fragments above the fold.",
          }),
        );
      }

      if (!page.title || titleLength === 0) {
        issues.push(
          createSinglePageIssue(page, {
            id: "missing_title",
            category: "seo",
            severity: "error",
            rank: 9,
            title: "Missing <title>",
            description: "Page does not define a title tag.",
            evidence: [{ type: "content", message: "No <title> text extracted.", url: page.url }],
            recommendation: "Add a unique, descriptive <title> tag.",
          }),
        );
      } else if (titleLength < 20 || titleLength > 65) {
        issues.push(
          createSinglePageIssue(page, {
            id: "title_length_out_of_range",
            category: "seo",
            severity: "warning",
            rank: 6,
            title: "Title length out of range",
            description: "Title length should be between 20 and 65 characters.",
            evidence: [{ type: "content", message: `Title length is ${titleLength}.`, url: page.url }],
            recommendation: "Adjust title length to keep it concise and descriptive.",
          }),
        );
      }

      if (context.includeSerp && (!page.meta_description || descriptionLength === 0)) {
        issues.push(
          createSinglePageIssue(page, {
            id: "meta_description_missing",
            category: "serp",
            severity: "warning",
            rank: 5,
            title: "Meta description missing",
            description: "Page does not define a meta description.",
            evidence: [{ type: "content", message: "No meta description extracted.", url: page.url }],
            recommendation: "Add a concise meta description aligned with search intent.",
          }),
        );
      } else if (context.includeSerp && (descriptionLength < 70 || descriptionLength > 165)) {
        issues.push(
          createSinglePageIssue(page, {
            id: "description_length_out_of_range",
            category: "serp",
            severity: "notice",
            rank: 4,
            title: "Description length out of range",
            description: "Meta description length should be between 70 and 165 characters.",
            evidence: [{ type: "content", message: `Description length is ${descriptionLength}.`, url: page.url }],
            recommendation: "Adjust description length to improve snippet quality.",
          }),
        );
      }

      if (context.includeSerp && page.metaDescriptionText.length > 0) {
        const repeatStats = countTopKeywordRepeat(page.metaDescriptionText);
        if (repeatStats.count >= 4 || repeatStats.ratio >= 0.22) {
          issues.push(
            createSinglePageIssue(page, {
              id: "meta_description_spammy",
              category: "serp",
              severity: "notice",
              rank: 3,
              title: "Meta description may look spammy",
              description: "Meta description has unusually repetitive keyword usage.",
              evidence: [
                {
                  type: "content",
                  message: `Top token "${repeatStats.topToken}" repeats ${repeatStats.count} times (${Math.round(
                    repeatStats.ratio * 100,
                  )}%).`,
                  url: page.url,
                },
              ],
              recommendation: "Rewrite description with natural language and lower repetition.",
            }),
          );
        }
      }

      if (h1Count === 0) {
        issues.push(
          createSinglePageIssue(page, {
            id: "missing_h1",
            category: "content",
            severity: "warning",
            rank: 6,
            title: "Missing H1 heading",
            description: "Page does not include an H1 heading.",
            evidence: [{ type: "content", message: "No heading level=1 found.", url: page.url }],
            recommendation: "Add a single H1 that reflects the page topic.",
          }),
        );
      } else if (h1Count > 1) {
        issues.push(
          createSinglePageIssue(page, {
            id: "multiple_h1",
            category: "content",
            severity: "warning",
            rank: 5,
            title: "Multiple H1 headings",
            description: "Page has more than one H1 heading.",
            evidence: [{ type: "content", message: `Detected ${h1Count} H1 headings.`, url: page.url }],
            recommendation: "Use one H1 and move additional section titles to H2/H3.",
          }),
        );
      }

      if (hasHeadingSkip(page)) {
        issues.push(
          createSinglePageIssue(page, {
            id: "heading_level_skips",
            category: "content",
            severity: "notice",
            rank: 3,
            title: "Heading level skips detected",
            description: "Heading levels skip hierarchy steps (e.g. H2 to H4).",
            evidence: [{ type: "content", message: "Outline contains heading level jumps.", url: page.url }],
            recommendation: "Maintain consistent heading hierarchy for readability and structure.",
          }),
        );
      }

      if (!page.canonical) {
        issues.push(
          createSinglePageIssue(page, {
            id: "missing_canonical",
            category: "seo",
            severity: "notice",
            rank: 4,
            title: "Missing canonical URL",
            description: "Page does not define rel=canonical.",
            evidence: [{ type: "content", message: "No canonical tag extracted.", url: page.url }],
            recommendation: "Add rel=canonical pointing to preferred URL.",
          }),
        );
      } else if (canonicalNormalized && canonicalNormalized !== page.final_url) {
        issues.push(
          createSinglePageIssue(page, {
            id: "canonical_mismatch",
            category: "seo",
            severity: "warning",
            rank: 6,
            title: "Canonical mismatch",
            description: "Canonical URL differs from the fetched final URL.",
            evidence: [{ type: "content", message: `Canonical points to ${canonicalNormalized}.`, url: page.url }],
            recommendation: "Align canonical URL with the intended primary URL.",
          }),
        );
      }

      if (parseMetaNoindex(page.meta_robots)) {
        issues.push(
          createSinglePageIssue(page, {
            id: "meta_noindex",
            category: "indexability",
            severity: "error",
            rank: 10,
            title: "Meta robots contains noindex",
            description: "Page is marked as non-indexable by meta robots.",
            evidence: [{ type: "content", message: "Detected noindex token in robots meta.", url: page.url }],
            recommendation: "Remove noindex if page should appear in search results.",
          }),
        );
      }

      if (context.includeSerp && isServiceLocalPage(page.final_url)) {
        const intentHaystack = normalizeForCompare(`${page.headingTextConcat} ${page.mainText}`);
        if (!hasAnyKeyword(intentHaystack, SECTION_KEYWORDS.forWho)) {
          issues.push(
            createSinglePageIssue(page, {
              id: "missing_section_for_who",
              category: "intent",
              severity: "notice",
              rank: 3,
              title: "Missing section: for who / indications",
              description: "Service page lacks a visible section clarifying who the service is for.",
              evidence: [{ type: "content", message: "No keywords matched: dla kogo/kiedy/wskazania.", url: page.url }],
              recommendation: "Add a section clarifying for whom the service is intended and when to use it.",
            }),
          );
        }
        if (!hasAnyKeyword(intentHaystack, SECTION_KEYWORDS.process)) {
          issues.push(
            createSinglePageIssue(page, {
              id: "missing_section_process",
              category: "intent",
              severity: "notice",
              rank: 3,
              title: "Missing section: process",
              description: "Service page does not explain process/flow clearly.",
              evidence: [{ type: "content", message: "No keywords matched: jak wygląda/przebieg/etapy.", url: page.url }],
              recommendation: "Add process details (steps, what to expect, timeline).",
            }),
          );
        }
        if (!hasAnyKeyword(intentHaystack, SECTION_KEYWORDS.pricingOrLogistics)) {
          issues.push(
            createSinglePageIssue(page, {
              id: "missing_section_pricing_or_logistics",
              category: "intent",
              severity: "notice",
              rank: 2,
              title: "Missing section: pricing/logistics",
              description: "Service page does not clearly cover cost, duration, or booking logistics.",
              evidence: [{ type: "content", message: "No keywords matched: cennik/koszt/czas/umów/rezerwacja.", url: page.url }],
              recommendation: "Add practical information such as price range, session duration, and booking method.",
            }),
          );
        }
        if (!hasAnyKeyword(intentHaystack, SECTION_KEYWORDS.faq)) {
          issues.push(
            createSinglePageIssue(page, {
              id: "missing_section_faq",
              category: "intent",
              severity: "notice",
              rank: 2,
              title: "Missing FAQ section",
              description: "Service page lacks FAQ-style Q&A coverage.",
              evidence: [{ type: "content", message: "No FAQ markers detected.", url: page.url }],
              recommendation: "Add FAQ section addressing common service questions and concerns.",
            }),
          );
        }
      }

      const thinThreshold = isServiceLocalPage(page.final_url) ? context.serviceMinWords : context.defaultMinWords;
      if (page.wordCountMain < thinThreshold) {
        issues.push(
          createSinglePageIssue(page, {
            id: "thin_content",
            category: "content_quality",
            severity: "warning",
            rank: 5,
            title: "Thin main content",
            description: "Main content appears too short for the detected page type.",
            evidence: [
              {
                type: "content",
                message: `wordCountMain=${page.wordCountMain}, threshold=${thinThreshold}.`,
                url: page.url,
              },
            ],
            recommendation: "Expand core content with concrete, intent-aligned sections and examples.",
          }),
        );
      }
    }

    if (isBlockedByRobots(page.url, context.robotsDisallow)) {
      issues.push(
        createSinglePageIssue(page, {
          id: "blocked_by_robots",
          category: "indexability",
          severity: "warning",
          rank: 7,
          title: "Blocked by robots.txt",
          description: "URL appears blocked by robots.txt disallow rules.",
          evidence: [{ type: "http", message: "Matched robots disallow rule.", url: page.url }],
          recommendation: "Adjust robots rules if this URL should be crawlable.",
        }),
      );
    }

    if (parseMetaNoindex(page.metaRobotsContent) !== parseNoindexFromHeader(page.xRobotsTagHeader)) {
      issues.push(
        createSinglePageIssue(page, {
          id: "robots_meta_xrobots_conflict",
          category: "indexation_conflicts",
          severity: "warning",
          rank: 8,
          title: "Meta robots and X-Robots-Tag conflict",
          description: "Meta robots and X-Robots-Tag header send conflicting indexation directives.",
          evidence: [
            {
              type: "http",
              message: `metaRobots="${page.metaRobotsContent || "(empty)"}", xRobotsTag="${page.xRobotsTagHeader || "(empty)"}"`,
              url: page.url,
            },
          ],
          recommendation: "Align meta robots and X-Robots-Tag to a single indexation intent.",
        }),
      );
    }

    if (looksIndexable(page) && page.status !== 200) {
      issues.push(
        createSinglePageIssue(page, {
          id: "non_200_indexable",
          category: "indexability",
          severity: "warning",
          rank: 7,
          title: "Indexable page is not HTTP 200",
          description: "Page appears indexable but returns non-200 status.",
          evidence: [{ type: "http", message: `Status code is ${page.status}.`, url: page.url }],
          recommendation: "Serve indexable pages with HTTP 200.",
        }),
      );
    }

    if (isOnPageAuditable && page.images.missing_alt_count > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "images_missing_alt",
          category: "content",
          severity: "warning",
          rank: 5,
          title: "Images missing alt text",
          description: "Page has images without alt attributes.",
          evidence: [
            {
              type: "content",
              message: `${page.images.missing_alt_count} images missing alt text.`,
              url: page.url,
            },
          ],
          recommendation: "Add descriptive alt text to important images.",
        }),
      );
    }

    if (isOnPageAuditable && page.schema.json_parse_failures.length > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "invalid_jsonld",
          category: "schema",
          severity: "warning",
          rank: 7,
          title: "Invalid JSON-LD detected",
          description: "At least one JSON-LD block could not be parsed.",
          evidence: page.schema.json_parse_failures.map((message) => ({ type: "schema", message, url: page.url })),
          recommendation: "Fix JSON syntax and validate structured data.",
        }),
      );
    }

    const hasOrganizationSchema = page.schema.detected_schema_types.some((type) => ["Organization", "LocalBusiness"].includes(type));
    if (isOnPageAuditable && !hasOrganizationSchema) {
      issues.push(
        createSinglePageIssue(page, {
          id: "missing_org_schema",
          category: "schema",
          severity: "notice",
          rank: 3,
          title: "Missing organization schema",
          description: "Organization-like schema was not detected.",
          evidence: [{ type: "schema", message: "No Organization/LocalBusiness schema type found.", url: page.url }],
          recommendation: "Add Organization or LocalBusiness structured data where relevant.",
        }),
      );
    }

    const pathDepth = new URL(page.final_url).pathname.split("/").filter((segment) => segment.length > 0).length;
    const hasBreadcrumb = page.schema.detected_schema_types.includes("BreadcrumbList");
    if (isOnPageAuditable && pathDepth >= 2 && !hasBreadcrumb) {
      issues.push(
        createSinglePageIssue(page, {
          id: "missing_breadcrumb_schema",
          category: "schema",
          severity: "notice",
          rank: 2,
          title: "Missing breadcrumb schema on deep page",
          description: "Deep page does not expose BreadcrumbList schema.",
          evidence: [{ type: "schema", message: `Path depth is ${pathDepth}.`, url: page.url }],
          recommendation: "Add BreadcrumbList schema for deeper content pages.",
        }),
      );
    }

    const schemaObjects = collectSchemaObjects(page.jsonLdParsed);
    const orgLikeObjects = schemaObjects.filter((record) => hasSchemaType(record, "Organization") || hasSchemaType(record, "LocalBusiness"));
    const incompleteOrgSchemas = orgLikeObjects.filter((record) => {
      const hasName = typeof record.name === "string" && normalizeText(record.name)?.length;
      const hasUrl = typeof record.url === "string" && normalizeText(record.url)?.length;
      const hasLogo = typeof record.logo === "string" || (record.logo && typeof record.logo === "object");
      return !(hasName && hasUrl && hasLogo);
    });
    if (isOnPageAuditable && incompleteOrgSchemas.length > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "org_schema_incomplete",
          category: "schema_quality",
          severity: "notice",
          rank: 4,
          title: "Organization schema is incomplete",
          description: "Organization/LocalBusiness schema is missing required minimum fields.",
          evidence: [
            {
              type: "schema",
              message: `Incomplete org-like schema blocks: ${incompleteOrgSchemas.length}.`,
              url: page.url,
            },
          ],
          recommendation: "Add minimum fields: name, url, logo for organization-like schema objects.",
        }),
      );
    }

    const breadcrumbObjects = schemaObjects.filter((record) => hasSchemaType(record, "BreadcrumbList"));
    const invalidBreadcrumbCount = breadcrumbObjects.filter((record) => {
      const list = record.itemListElement;
      if (!Array.isArray(list) || list.length === 0) {
        return true;
      }
      return list.some((item) => {
        if (!item || typeof item !== "object") {
          return true;
        }
        const itemRecord = item as Record<string, unknown>;
        const embedded = itemRecord.item;
        const hasName = typeof itemRecord.name === "string" || (embedded && typeof embedded === "object" && typeof (embedded as Record<string, unknown>).name === "string");
        const hasUrl =
          typeof itemRecord.item === "string" ||
          (embedded && typeof embedded === "object" && typeof (embedded as Record<string, unknown>).url === "string");
        return !(hasName && hasUrl);
      });
    }).length;
    if (isOnPageAuditable && invalidBreadcrumbCount > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "breadcrumb_schema_invalid",
          category: "schema_quality",
          severity: "warning",
          rank: 6,
          title: "Breadcrumb schema appears invalid",
          description: "BreadcrumbList schema is missing required item chain fields.",
          evidence: [
            {
              type: "schema",
              message: `Invalid BreadcrumbList blocks: ${invalidBreadcrumbCount}.`,
              url: page.url,
            },
          ],
          recommendation: "Provide complete itemListElement chain with url and name per breadcrumb item.",
        }),
      );
    }

    if (!page.security.is_https) {
      issues.push(
        createSinglePageIssue(page, {
          id: "https_missing",
          category: "security",
          severity: "error",
          rank: 8,
          title: "HTTPS missing",
          description: "Page is served over non-HTTPS URL.",
          evidence: [{ type: "security", message: "Final URL is not HTTPS.", url: page.url }],
          recommendation: "Redirect traffic to HTTPS and enforce secure transport.",
        }),
      );
    }

    if (page.security.mixed_content_candidates.length > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "mixed_content",
          category: "security",
          severity: "warning",
          rank: 6,
          title: "Mixed content candidates detected",
          description: "HTTPS page references HTTP assets.",
          evidence: page.security.mixed_content_candidates.map((candidate) => ({
            type: "security",
            message: `HTTP asset: ${candidate}`,
            url: page.url,
          })),
          recommendation: "Serve all assets via HTTPS.",
        }),
      );
    }

    if (page.security.security_headers_missing.length > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "missing_security_headers",
          category: "security",
          severity: "warning",
          rank: 5,
          title: "Missing security headers",
          description: "One or more recommended security headers are missing.",
          evidence: [
            {
              type: "security",
              message: `Missing headers: ${page.security.security_headers_missing.join(", ")}`,
              url: page.url,
            },
          ],
          recommendation: "Add baseline security headers at the server or CDN layer.",
        }),
      );
    }

    if (page.schemaTypesDetected.length > 0 && (noindexMeta || noindexHeader || isBlockedByRobots(page.url, context.robotsDisallow))) {
      issues.push(
        createSinglePageIssue(page, {
          id: "schema_blocked_or_noindex_conflict",
          category: "schema_quality",
          severity: "notice",
          rank: 4,
          title: "Schema present on blocked/noindex page",
          description: "Structured data is present, but the page is blocked or marked noindex.",
          evidence: [
            {
              type: "schema",
              message: `schemaTypes=${page.schemaTypesDetected.join(", ")}`,
              url: page.url,
            },
          ],
          recommendation: "Resolve indexation status first or limit schema to pages intended for indexing.",
        }),
      );
    }

    if (!page.htmlLang || page.htmlLang.trim().length === 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "missing_html_lang",
          category: "a11y",
          severity: "notice",
          rank: 2,
          title: "Missing html[lang]",
          description: "The root <html> element does not declare a language.",
          evidence: [{ type: "content", message: "html[lang] is missing or empty.", url: page.url }],
          recommendation: "Set html[lang] to the primary language of page content.",
        }),
      );
    }

    if (page.linksWithoutAccessibleNameCount > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "links_without_accessible_name",
          category: "a11y",
          severity: "notice",
          rank: 2,
          title: "Links without accessible name",
          description: "One or more links are missing visible text and accessibility labels.",
          evidence: [
            {
              type: "content",
              message: `Count: ${page.linksWithoutAccessibleNameCount}.`,
              url: page.url,
            },
          ],
          recommendation: "Add descriptive anchor text or aria-label/title for unlabeled links.",
        }),
      );
    }

    if (page.images.missing_alt_count > 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "images_alt_generic",
          category: "a11y",
          severity: "notice",
          rank: 2,
          title: "Generic or missing image alt text",
          description: "Image alt text quality is weak (missing and/or likely generic).",
          evidence: [
            {
              type: "content",
              message: `missingAltCount=${page.images.missing_alt_count}.`,
              url: page.url,
            },
          ],
          recommendation: "Use concise, descriptive alt text that reflects image meaning in context.",
        }),
      );
    }

    if (page.inlinksCount === 0 && !new URL(page.final_url).pathname.match(/^\/?$/)) {
      issues.push(
        createSinglePageIssue(page, {
          id: "orphan_page",
          category: "internal_links",
          severity: "warning",
          rank: 6,
          title: "Orphan page",
          description: "Page has no internal inlinks.",
          evidence: [{ type: "link", message: "inlinksCount is 0.", url: page.url }],
          recommendation: "Add contextual internal links from relevant pages.",
        }),
      );
    } else if (page.inlinksCount <= 1 && !new URL(page.final_url).pathname.match(/^\/?$/)) {
      issues.push(
        createSinglePageIssue(page, {
          id: "near_orphan_page",
          category: "internal_links",
          severity: "notice",
          rank: 4,
          title: "Near-orphan page",
          description: "Page has one or fewer internal inlinks.",
          evidence: [{ type: "link", message: `inlinksCount is ${page.inlinksCount}.`, url: page.url }],
          recommendation: "Increase internal link support with intent-relevant anchors.",
        }),
      );
    }

    if (anchorStats.total > 0 && anchorStats.navLikely / anchorStats.total > 0.5) {
      issues.push(
        createSinglePageIssue(page, {
          id: "excessive_nav_only_inlinks",
          category: "internal_links",
          severity: "notice",
          rank: 3,
          title: "Inlinks are mostly navigation/footer links",
          description: "Most inlinks to this page appear to come from nav/header/footer placements.",
          evidence: [
            {
              type: "link",
              message: `navLikelyInlinks=${anchorStats.navLikely}/${anchorStats.total}.`,
              url: page.url,
            },
          ],
          recommendation: "Add contextual in-content links from semantically related pages.",
        }),
      );
    }
  }

  issues.push(
    ...collectDuplicateFieldIssues({
      pages: auditablePages,
      fieldName: "title",
      valueByPage: (page) => page.title,
      issueId: "duplicate_title",
      category: "seo",
      severity: "warning",
      rank: 7,
      title: "Duplicate titles detected",
      description: "Multiple pages share identical title text.",
      recommendation: "Make each page title unique and intent-specific.",
    }),
  );

  const chunkToUrls = new Map<string, Set<string>>();
  for (const page of auditablePages) {
    for (const chunk of extractTextChunks(page.mainText)) {
      if (!chunkToUrls.has(chunk)) {
        chunkToUrls.set(chunk, new Set<string>());
      }
      chunkToUrls.get(chunk)?.add(page.url);
    }
  }

  const duplicateChunkEvidence = Array.from(chunkToUrls.entries())
    .map(([chunk, urlSet]) => ({ chunk, urls: Array.from(urlSet).sort(compareStrings) }))
    .filter((entry) => entry.urls.length >= 2)
    .sort((a, b) => {
      const sizeDelta = b.urls.length - a.urls.length;
      if (sizeDelta !== 0) {
        return sizeDelta;
      }
      return compareStrings(a.chunk, b.chunk);
    })
    .slice(0, 8);

  if (duplicateChunkEvidence.length > 0) {
    issues.push(
      createIssue({
        id: "duplicate_blocks_across_pages",
        category: "content_quality",
        severity: "notice",
        rank: 3,
        title: "Repeated content blocks across pages",
        description: "Similar long text blocks appear on multiple pages.",
        affectedUrls: uniqueSorted(duplicateChunkEvidence.flatMap((entry) => entry.urls)),
        evidence: duplicateChunkEvidence.map((entry) => ({
          type: "content",
          message: `Shared block across ${entry.urls.length} pages.`,
          details: {
            sample_text: entry.chunk.slice(0, 180),
            urls: entry.urls,
          },
        })),
        recommendation: "Differentiate core paragraphs per page intent to avoid template duplication.",
      }),
    );
  }

  if (normalizedFocusUrl) {
    const focusPage = auditablePages.find((page) => (normalizeUrl(page.final_url) ?? page.final_url) === normalizedFocusUrl);
    if (focusPage && focusPage.inlinksCount < context.focusInlinksThreshold) {
      issues.push(
        createSinglePageIssue(focusPage, {
          id: "focus_inlinks_count_low",
          category: "internal_links",
          severity: "warning",
          rank: 7,
          title: "Focus page has low inlink count",
          description: "Focus URL has fewer internal inlinks than recommended baseline.",
          evidence: [
            {
              type: "link",
              message: `inlinksCount=${focusPage.inlinksCount}, threshold=${context.focusInlinksThreshold}.`,
              url: focusPage.url,
            },
          ],
          recommendation: "Add contextual internal links to focus URL from relevant high-value pages.",
        }),
      );
    }

    if (focusPage) {
      const focusStats = inlinkAnchorStatsByTarget.get(normalizedFocusUrl) ?? { total: 0, generic: 0, empty: 0, navLikely: 0 };
      if (focusStats.total > 0 && (focusStats.generic + focusStats.empty) / focusStats.total > 0.4) {
        issues.push(
          createSinglePageIssue(focusPage, {
            id: "focus_anchor_quality_low",
            category: "internal_links",
            severity: "warning",
            rank: 6,
            title: "Focus page anchor quality is low",
            description: "Generic or empty anchors dominate inlinks to focus URL.",
            evidence: [
              {
                type: "link",
                message: `generic+empty=${focusStats.generic + focusStats.empty}/${focusStats.total}.`,
                url: focusPage.url,
              },
            ],
            recommendation: "Improve anchor specificity around topic and user intent.",
          }),
        );
      }
    }
  }

  const canonicalStatuses = new Map<string, number | null>();
  for (const page of auditablePages) {
    if (!page.canonicalUrl) {
      continue;
    }
    if (!canonicalStatuses.has(page.canonicalUrl)) {
      canonicalStatuses.set(page.canonicalUrl, statusByUrl.get(page.canonicalUrl) ?? null);
    }
  }

  const canonicalChecks = await mapWithConcurrency(
    Array.from(canonicalStatuses.entries()),
    HTTP_STATUS_CONCURRENCY,
    async ([canonicalUrl, cachedStatus]) => {
      if (cachedStatus !== null && cachedStatus >= 200 && cachedStatus < 300) {
        return null;
      }
      const fallbackStatus = cachedStatus ?? (await resolveStatus(canonicalUrl)).status;
      if (fallbackStatus !== null && fallbackStatus >= 200 && fallbackStatus < 300) {
        return null;
      }
      return { canonicalUrl, fallbackStatus };
    },
  );
  for (const item of canonicalChecks.filter((entry): entry is { canonicalUrl: string; fallbackStatus: number | null } => Boolean(entry))) {
    const affected = auditablePages.filter((page) => page.canonicalUrl === item.canonicalUrl);
    issues.push(
      createIssue({
        id: "canonical_to_non_200",
        category: "indexation_conflicts",
        severity: "warning",
        rank: 7,
        title: "Canonical points to non-200 URL",
        description: "Canonical target URL is not returning HTTP 200.",
        affectedUrls: affected.map((page) => page.url),
        evidence: [
          {
            type: "http",
            message: `Canonical ${item.canonicalUrl} status=${item.fallbackStatus ?? "unreachable"}.`,
            target_url: item.canonicalUrl,
            status: item.fallbackStatus ?? undefined,
          },
        ],
        recommendation: "Update canonical to a stable, indexable 200 URL.",
      }),
    );
  }

  const sitemapUrlSet = new Set(context.sitemapUrls.map((url) => normalizeUrl(url) ?? url));
  const sitemapConflicts = auditablePages.filter((page) => {
    const pageKey = normalizeUrl(page.final_url) ?? page.final_url;
    const canonicalKey = page.canonicalUrl ? normalizeUrl(page.canonicalUrl) ?? page.canonicalUrl : null;
    return sitemapUrlSet.has(pageKey) && canonicalKey !== null && canonicalKey !== pageKey;
  });
  if (sitemapConflicts.length > 0) {
    issues.push(
      createIssue({
        id: "sitemap_contains_non_canonical",
        category: "indexation_conflicts",
        severity: "notice",
        rank: 4,
        title: "Sitemap contains non-canonical URLs",
        description: "Some sitemap URLs canonicalize to a different destination.",
        affectedUrls: sitemapConflicts.map((page) => page.url),
        evidence: sitemapConflicts.slice(0, 10).map((page) => ({
          type: "http",
          message: `Sitemap URL canonicalizes to ${page.canonicalUrl}.`,
          url: page.url,
          target_url: page.canonicalUrl ?? undefined,
        })),
        recommendation: "Align sitemap entries with canonical destinations.",
      }),
    );
  }

  if (context.includeSerp) {
    issues.push(
      ...collectDuplicateFieldIssues({
        pages: auditablePages,
        fieldName: "description",
        valueByPage: (page) => page.meta_description,
        issueId: "meta_description_duplicate",
        category: "serp",
        severity: "notice",
        rank: 4,
        title: "Duplicate meta descriptions",
        description: "Multiple pages share identical meta description text.",
        recommendation: "Use unique descriptions per page.",
      }),
    );
  }

  const internalBroken = await collectBrokenLinkEvidence({
    pages,
    internal: true,
    robotsRules: context.robotsDisallow,
    resolveStatus,
  });
  if (internalBroken.length > 0) {
    issues.push(
      createIssue({
        id: "broken_internal_links",
        category: "technical",
        severity: "error",
        rank: 8,
        title: "Broken internal links",
        description: "Some internal links resolve to errors or unreachable targets.",
        affectedUrls: uniqueSorted(internalBroken.map((item) => item.sourceUrl)),
        evidence: internalBroken.map((item) => ({
          type: "link",
          message: item.error ? item.error : `Status ${item.status}`,
          source_url: item.sourceUrl,
          target_url: item.targetUrl,
          status: item.status ?? undefined,
        })),
        recommendation: "Fix or remove broken internal links.",
      }),
    );
  }

  const externalBroken = await collectBrokenLinkEvidence({
    pages,
    internal: false,
    robotsRules: context.robotsDisallow,
    resolveStatus,
  });
  if (externalBroken.length > 0) {
    issues.push(
      createIssue({
        id: "broken_external_links",
        category: "technical",
        severity: "warning",
        rank: 6,
        title: "Broken external links",
        description: "Some outbound links return errors or time out.",
        affectedUrls: uniqueSorted(externalBroken.map((item) => item.sourceUrl)),
        evidence: externalBroken.map((item) => ({
          type: "link",
          message: item.error ? item.error : `Status ${item.status}`,
          source_url: item.sourceUrl,
          target_url: item.targetUrl,
          status: item.status ?? undefined,
        })),
        recommendation: "Update or remove stale outbound links.",
      }),
    );
  }

  const redirectCandidates = uniqueSorted(
    pages
      .filter((page) => page.url !== page.final_url || (statusByUrl.get(page.url) ?? 0) >= 300)
      .map((page) => page.url),
  );
  const redirectChains = (
    await mapWithConcurrency(redirectCandidates, REDIRECT_CHAIN_CONCURRENCY, async (candidate) => {
      const chainLength = await getRedirectChainLength(candidate, context.timeoutMs);
      if (chainLength > 1) {
        return { url: candidate, chainLength };
      }
      return null;
    })
  ).filter((item): item is { url: string; chainLength: number } => Boolean(item));
  if (redirectChains.length > 0) {
    issues.push(
      createIssue({
        id: "redirect_chain",
        category: "technical",
        severity: "warning",
        rank: 6,
        title: "Redirect chains detected",
        description: "One or more URLs require multiple redirect hops.",
        affectedUrls: redirectChains.map((item) => item.url),
        evidence: redirectChains.map((item) => ({
          type: "http",
          message: `Redirect chain length is ${item.chainLength}.`,
          url: item.url,
        })),
        recommendation: "Reduce redirects to a single hop where possible.",
      }),
    );
  }

  return sortIssuesDeterministic(issues);
}
