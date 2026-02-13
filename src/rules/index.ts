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

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort(compareStrings);
}

function normalizeText(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function safeUrl(baseUrl: string, raw: string): string | null {
  try {
    return new URL(raw, baseUrl).toString();
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

function createSinglePageIssue(page: PageExtract, input: Omit<IssueInput, "affectedUrls">): Issue {
  return createIssue({
    ...input,
    affectedUrls: [page.url],
  });
}

function collectDuplicateFieldIssues(input: {
  pages: PageExtract[];
  fieldName: "title" | "description";
  valueByPage: (page: PageExtract) => string | null;
  issueId: "duplicate_title" | "duplicate_description";
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
        category: "seo",
        severity: "warning",
        rank: 7,
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

async function collectBrokenLinkEvidence(input: {
  pages: PageExtract[];
  timeoutMs: number;
  internal: boolean;
}): Promise<LinkFailureEvidence[]> {
  const failures: LinkFailureEvidence[] = [];
  const statusByUrl = buildStatusMap(input.pages);
  const cache = new Map<string, { status: number | null; error: string | null }>();

  for (const page of input.pages) {
    const targets = input.internal ? page.links.internal_targets : page.links.external_targets;
    for (const target of targets) {
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

      if (!cache.has(target)) {
        cache.set(target, await fetchStatusWithFallback(target, input.timeoutMs));
      }
      const result = cache.get(target);
      if (!result) {
        continue;
      }

      if (result.status !== null && result.status < 400) {
        continue;
      }

      failures.push({
        sourceUrl: page.url,
        targetUrl: target,
        status: result.status,
        error: result.error,
      });
    }
  }

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
  const statusByUrl = buildStatusMap(pages);

  for (const page of pages) {
    const titleLength = page.title?.trim().length ?? 0;
    const descriptionLength = page.meta_description?.trim().length ?? 0;
    const h1Count = page.headings_outline.filter((heading) => heading.level === 1).length;
    const canonicalNormalized = page.canonical ? safeUrl(page.final_url, page.canonical) ?? page.canonical : null;

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

    if (!page.meta_description || descriptionLength === 0) {
      issues.push(
        createSinglePageIssue(page, {
          id: "missing_description",
          category: "seo",
          severity: "warning",
          rank: 7,
          title: "Missing meta description",
          description: "Page does not define a meta description.",
          evidence: [{ type: "content", message: "No meta description extracted.", url: page.url }],
          recommendation: "Add a concise meta description aligned with search intent.",
        }),
      );
    } else if (descriptionLength < 70 || descriptionLength > 165) {
      issues.push(
        createSinglePageIssue(page, {
          id: "description_length_out_of_range",
          category: "seo",
          severity: "notice",
          rank: 4,
          title: "Description length out of range",
          description: "Meta description length should be between 70 and 165 characters.",
          evidence: [{ type: "content", message: `Description length is ${descriptionLength}.`, url: page.url }],
          recommendation: "Adjust description length to improve snippet quality.",
        }),
      );
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

    if (page.images.missing_alt_count > 0) {
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

    if (page.schema.json_parse_failures.length > 0) {
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

    const hasOrganizationSchema = page.schema.detected_schema_types.some((type) =>
      ["Organization", "LocalBusiness"].includes(type),
    );
    if (!hasOrganizationSchema) {
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
    if (pathDepth >= 2 && !hasBreadcrumb) {
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
  }

  issues.push(
    ...collectDuplicateFieldIssues({
      pages,
      fieldName: "title",
      valueByPage: (page) => page.title,
      issueId: "duplicate_title",
      title: "Duplicate titles detected",
      description: "Multiple pages share identical title text.",
      recommendation: "Make each page title unique and intent-specific.",
    }),
  );

  issues.push(
    ...collectDuplicateFieldIssues({
      pages,
      fieldName: "description",
      valueByPage: (page) => page.meta_description,
      issueId: "duplicate_description",
      title: "Duplicate meta descriptions detected",
      description: "Multiple pages share identical meta description text.",
      recommendation: "Use unique descriptions per page.",
    }),
  );

  const internalBroken = await collectBrokenLinkEvidence({
    pages,
    timeoutMs: context.timeoutMs,
    internal: true,
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
    timeoutMs: context.timeoutMs,
    internal: false,
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
  const redirectChains: Array<{ url: string; chainLength: number }> = [];
  for (const candidate of redirectCandidates) {
    const chainLength = await getRedirectChainLength(candidate, context.timeoutMs);
    if (chainLength > 1) {
      redirectChains.push({ url: candidate, chainLength });
    }
  }
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
