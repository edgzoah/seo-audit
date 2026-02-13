import { loadConfig } from "../config/index.js";
import type { AuditInputs } from "../report/report-schema.js";
import { load } from "cheerio";

export type SeedSource = "start_url" | "robots_sitemap" | "default_sitemap" | "config_sitemap";

export interface DiscoveredSeed {
  url: string;
  source: SeedSource;
}

export interface SeedDiscoveryResult {
  seeds: string[];
  discovered: DiscoveredSeed[];
  robots_disallow: string[];
  sitemap_urls_checked: string[];
}

export interface CrawlEvent {
  type: "fetched" | "fetch_error";
  url: string;
  final_url: string | null;
  status: number | null;
  depth: number;
  content_type: string | null;
  timing_ms: number;
  error?: string;
}

export interface CrawledPage {
  url: string;
  final_url: string;
  status: number;
  depth: number;
  content_type: string | null;
  response_headers: Record<string, string>;
  html: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  events: CrawlEvent[];
}

export interface CrawlProgress {
  pagesFetched: number;
  eventsCount: number;
  queueLength: number;
  crawlLimit: number;
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function normalizeUrl(raw: string, baseUrl?: string): string | null {
  try {
    return baseUrl ? new URL(raw, baseUrl).toString() : new URL(raw).toString();
  } catch {
    return null;
  }
}

function parseRobots(content: string): { sitemapUrls: string[]; disallowRules: string[] } {
  const sitemapUrls = new Set<string>();
  const disallowRules = new Set<string>();
  const lines = content.split(/\r?\n/);
  let currentAgents: string[] = [];
  let inAnyUserAgentGroup = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const sitemapMatch = trimmed.match(/^sitemap\s*:\s*(.+)$/i);
    if (sitemapMatch?.[1]) {
      const value = sitemapMatch[1].trim();
      if (value.length > 0) {
        sitemapUrls.add(value);
      }
      continue;
    }

    const userAgentMatch = trimmed.match(/^user-agent\s*:\s*(.+)$/i);
    if (userAgentMatch?.[1]) {
      const agent = userAgentMatch[1].trim().toLowerCase();
      if (inAnyUserAgentGroup) {
        currentAgents.push(agent);
      } else {
        currentAgents = [agent];
      }
      inAnyUserAgentGroup = true;
      continue;
    }

    // new non-user-agent directive ends the "consecutive user-agent" header block
    inAnyUserAgentGroup = false;

    const disallowMatch = trimmed.match(/^disallow\s*:\s*(.+)$/i);
    if (disallowMatch?.[1]) {
      const rule = disallowMatch[1].trim();
      const appliesToWildcard = currentAgents.includes("*");
      if (appliesToWildcard && rule.length > 0 && !rule.includes("*")) {
        disallowRules.add(rule);
      }
    }
  }

  return {
    sitemapUrls: Array.from(sitemapUrls).sort(compareStrings),
    disallowRules: Array.from(disallowRules).sort(compareStrings),
  };
}

function extractSitemapLocUrls(xml: string): string[] {
  const urls = new Set<string>();
  const regex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null = regex.exec(xml);

  while (match) {
    const candidate = match[1]?.trim();
    if (candidate) {
      const normalized = normalizeUrl(candidate);
      if (normalized) {
        urls.add(normalized);
      }
    }
    match = regex.exec(xml);
  }

  return Array.from(urls).sort(compareStrings);
}

function matchesPattern(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => {
    const trimmed = pattern.trim();
    return trimmed.length > 0 && url.includes(trimmed);
  });
}

function isAllowedByDomain(url: string, allowedHosts: Set<string>): boolean {
  try {
    const host = new URL(url).host.toLowerCase();
    return allowedHosts.has(host);
  } catch {
    return false;
  }
}

function isBlockedByRobots(url: string, rules: string[]): boolean {
  if (rules.length === 0) {
    return false;
  }

  try {
    const pathname = new URL(url).pathname;
    return rules.some((rule) => pathname.startsWith(rule));
  } catch {
    return false;
  }
}

function resolveAllowedHosts(inputs: AuditInputs): Set<string> {
  if (inputs.allowed_domains.length > 0) {
    return new Set(inputs.allowed_domains.map((domain) => domain.toLowerCase()));
  }

  const hosts = new Set<string>();
  hosts.add(new URL(inputs.target).host.toLowerCase());

  const primaryFocus = inputs.brief.focus.primary_url;
  if (primaryFocus) {
    const normalized = normalizeUrl(primaryFocus, inputs.target);
    if (normalized) {
      hosts.add(new URL(normalized).host.toLowerCase());
    }
  }

  for (const secondaryUrl of inputs.brief.focus.secondary_urls) {
    const normalized = normalizeUrl(secondaryUrl, inputs.target);
    if (normalized) {
      hosts.add(new URL(normalized).host.toLowerCase());
    }
  }

  return hosts;
}

function applySeedFilters(input: {
  candidates: string[];
  inputs: AuditInputs;
  allowedHosts: Set<string>;
  robotsRules: string[];
}): string[] {
  const includePatterns = input.inputs.include_patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
  const excludePatterns = input.inputs.exclude_patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);

  const filtered = input.candidates.filter((url) => {
    if (!isAllowedByDomain(url, input.allowedHosts)) {
      return false;
    }

    const excluded = excludePatterns.some((pattern) => url.includes(pattern));
    if (excluded) {
      return false;
    }

    if (includePatterns.length > 0 && !matchesPattern(url, includePatterns)) {
      return false;
    }

    if (input.inputs.respect_robots && isBlockedByRobots(url, input.robotsRules)) {
      return false;
    }

    return true;
  });

  const unique = new Set(filtered);
  return Array.from(unique).sort(compareStrings);
}

async function fetchTextSafe(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

export async function discoverSeeds(inputs: AuditInputs): Promise<SeedDiscoveryResult> {
  const config = await loadConfig();
  const configSitemapUrls = (config.defaults.sitemap_urls ?? []).map((value) => value.trim()).filter((value) => value.length > 0);

  const normalizedStartUrl = new URL(inputs.target).toString();
  const discoveredMap = new Map<string, SeedSource>();
  discoveredMap.set(normalizedStartUrl, "start_url");

  const robotsSitemaps = new Set<string>();
  let robotsRules: string[] = [];

  if (inputs.respect_robots) {
    const robotsUrl = new URL("/robots.txt", normalizedStartUrl).toString();
    const robotsText = await fetchTextSafe(robotsUrl, inputs.timeout_ms);
    if (robotsText) {
      const parsed = parseRobots(robotsText);
      robotsRules = parsed.disallowRules;
      for (const rawSitemap of parsed.sitemapUrls) {
        const normalized = normalizeUrl(rawSitemap, normalizedStartUrl);
        if (normalized) {
          robotsSitemaps.add(normalized);
        }
      }
    }
  }

  const candidateSitemaps: Array<{ url: string; source: SeedSource }> = [];
  for (const sitemapUrl of Array.from(robotsSitemaps).sort(compareStrings)) {
    candidateSitemaps.push({ url: sitemapUrl, source: "robots_sitemap" });
  }

  candidateSitemaps.push({ url: new URL("/sitemap.xml", normalizedStartUrl).toString(), source: "default_sitemap" });
  for (const sitemapUrl of configSitemapUrls.map((url) => normalizeUrl(url, normalizedStartUrl)).filter((url): url is string => Boolean(url)).sort(compareStrings)) {
    candidateSitemaps.push({ url: sitemapUrl, source: "config_sitemap" });
  }

  const sitemapByUrl = new Map<string, SeedSource>();
  for (const candidate of candidateSitemaps) {
    if (!sitemapByUrl.has(candidate.url)) {
      sitemapByUrl.set(candidate.url, candidate.source);
    }
  }

  const sitemapUrlsChecked = Array.from(sitemapByUrl.keys());

  const sitemapDiscoveredUrls: Array<{ url: string; source: SeedSource }> = [];
  for (const sitemapUrl of sitemapUrlsChecked) {
    const source = sitemapByUrl.get(sitemapUrl) ?? "default_sitemap";
    const xml = await fetchTextSafe(sitemapUrl, inputs.timeout_ms);
    if (!xml) {
      continue;
    }

    for (const locUrl of extractSitemapLocUrls(xml)) {
      sitemapDiscoveredUrls.push({ url: locUrl, source });
    }
  }

  const allowedHosts = resolveAllowedHosts(inputs);
  const filteredSitemapUrls = applySeedFilters({
    candidates: sitemapDiscoveredUrls.map((entry) => entry.url),
    inputs,
    allowedHosts,
    robotsRules,
  });

  const filteredSet = new Set(filteredSitemapUrls);
  for (const entry of sitemapDiscoveredUrls) {
    if (!filteredSet.has(entry.url)) {
      continue;
    }
    if (!discoveredMap.has(entry.url)) {
      discoveredMap.set(entry.url, entry.source);
    }
  }

  const tailSeeds = Array.from(discoveredMap.keys())
    .filter((url) => url !== normalizedStartUrl)
    .sort(compareStrings);
  const allSeeds = [normalizedStartUrl, ...tailSeeds];

  const limitedSeeds = inputs.coverage === "quick" ? allSeeds.slice(0, Math.max(1, inputs.max_pages)) : allSeeds;
  const limitedSet = new Set(limitedSeeds);

  const discovered: DiscoveredSeed[] = Array.from(discoveredMap.entries())
    .filter(([url]) => limitedSet.has(url))
    .sort((a, b) => compareStrings(a[0], b[0]))
    .map(([url, source]) => ({ url, source }));

  return {
    seeds: limitedSeeds,
    discovered,
    robots_disallow: robotsRules,
    sitemap_urls_checked: sitemapUrlsChecked,
  };
}

function patternize(url: string): string {
  const parsed = new URL(url);
  const rawSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  const normalizedSegments = rawSegments.map((segment) => {
    if (/^\d+$/.test(segment)) {
      return "{n}";
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) {
      return "{id}";
    }
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(segment) && segment.length >= 12) {
      return "{slug}";
    }
    return segment;
  });

  return `/${normalizedSegments.join("/")}`;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const entries = Array.from(headers.entries()).sort((a, b) => compareStrings(a[0], b[0]));
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

function extractInternalLinks(html: string, pageUrl: string): string[] {
  const parsedPageUrl = new URL(pageUrl);
  const pageHost = parsedPageUrl.host.toLowerCase();
  const links = new Set<string>();
  const $ = load(html);

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      return;
    }

    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) {
      return;
    }

    try {
      const normalizedUrl = new URL(normalized);
      if (normalizedUrl.host.toLowerCase() === pageHost) {
        links.add(normalizedUrl.toString());
      }
    } catch {
      // ignore invalid normalized links
    }
  });

  return Array.from(links).sort(compareStrings);
}

function shouldAllowUrlForCrawl(url: string, inputs: AuditInputs, allowedHosts: Set<string>): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.startsWith("/cdn-cgi/")) {
      return false;
    }
  } catch {
    return false;
  }

  if (!isAllowedByDomain(url, allowedHosts)) {
    return false;
  }

  const excluded = inputs.exclude_patterns.some((pattern) => {
    const trimmed = pattern.trim();
    return trimmed.length > 0 && url.includes(trimmed);
  });
  if (excluded) {
    return false;
  }

  const includePatterns = inputs.include_patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
  if (includePatterns.length > 0 && !matchesPattern(url, includePatterns)) {
    return false;
  }

  return true;
}

export async function crawlSite(
  inputs: AuditInputs,
  seeds: string[],
  onProgress?: (progress: CrawlProgress) => void,
): Promise<CrawlResult> {
  const focusUrl = inputs.brief.focus.primary_url ? normalizeUrl(inputs.brief.focus.primary_url, inputs.target) : null;
  const normalizedSeeds = Array.from(
    new Set(
      seeds
        .map((seed) => normalizeUrl(seed, inputs.target))
        .filter((seed): seed is string => Boolean(seed)),
    ),
  );

  const queue: Array<{ url: string; depth: number }> = normalizedSeeds.map((url) => ({ url, depth: 0 }));
  const queued = new Set(normalizedSeeds);
  if (focusUrl && !queued.has(focusUrl)) {
    queue.unshift({ url: focusUrl, depth: 0 });
    queued.add(focusUrl);
  }

  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const events: CrawlEvent[] = [];
  const allowedHosts = resolveAllowedHosts(inputs);
  const surfacePatterns = new Set<string>();
  const forcedNeighborhoodUrls = new Set<string>();
  const focusNeighborhoodCap = focusUrl ? 25 : 0;
  let focusNeighborhoodCount = 0;
  const crawlLimit = inputs.max_pages + focusNeighborhoodCap;

  while (queue.length > 0 && pages.length < crawlLimit) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (visited.has(current.url)) {
      continue;
    }
    visited.add(current.url);

    if (!shouldAllowUrlForCrawl(current.url, inputs, allowedHosts)) {
      continue;
    }

    const isForcedNeighborhood = forcedNeighborhoodUrls.has(current.url) || (focusUrl !== null && current.url === focusUrl);
    if (inputs.coverage === "surface" && !isForcedNeighborhood) {
      const pattern = patternize(current.url);
      if (surfacePatterns.has(pattern)) {
        continue;
      }
      surfacePatterns.add(pattern);
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(current.url, {
        headers: {
          "user-agent": inputs.user_agent,
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(inputs.timeout_ms),
      });

      const timingMs = Date.now() - startedAt;
      const finalUrl = response.url || current.url;
      const contentType = response.headers.get("content-type");
      const headersRecord = headersToRecord(response.headers);
      const html = await response.text();

      pages.push({
        url: current.url,
        final_url: finalUrl,
        status: response.status,
        depth: current.depth,
        content_type: contentType,
        response_headers: headersRecord,
        html,
      });

      events.push({
        type: "fetched",
        url: current.url,
        final_url: finalUrl,
        status: response.status,
        depth: current.depth,
        content_type: contentType,
        timing_ms: timingMs,
      });

      const internalLinks = extractInternalLinks(html, finalUrl);
      const normalizedFinalUrl = normalizeUrl(finalUrl);
      const isFocusPage =
        focusUrl !== null && (current.url === focusUrl || (normalizedFinalUrl !== null && normalizedFinalUrl === focusUrl));

      if (isFocusPage && focusNeighborhoodCount < focusNeighborhoodCap) {
        for (const link of internalLinks) {
          if (focusNeighborhoodCount >= focusNeighborhoodCap) {
            break;
          }

          if (queued.has(link) || visited.has(link)) {
            continue;
          }
          if (!shouldAllowUrlForCrawl(link, inputs, allowedHosts)) {
            continue;
          }

          queue.push({ url: link, depth: current.depth + 1 });
          queued.add(link);
          forcedNeighborhoodUrls.add(link);
          focusNeighborhoodCount += 1;
        }
      }

      const canDiscoverLinks = (inputs.coverage === "surface" || inputs.coverage === "full") && current.depth < inputs.crawl_depth;
      if (!canDiscoverLinks) {
        continue;
      }

      for (const link of internalLinks) {
        if (queued.has(link) || visited.has(link)) {
          continue;
        }

        if (!shouldAllowUrlForCrawl(link, inputs, allowedHosts)) {
          continue;
        }

        queue.push({ url: link, depth: current.depth + 1 });
        queued.add(link);
      }
      onProgress?.({
        pagesFetched: pages.length,
        eventsCount: events.length,
        queueLength: queue.length,
        crawlLimit,
      });
    } catch (error) {
      const timingMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      events.push({
        type: "fetch_error",
        url: current.url,
        final_url: null,
        status: null,
        depth: current.depth,
        content_type: null,
        timing_ms: timingMs,
        error: message,
      });
      onProgress?.({
        pagesFetched: pages.length,
        eventsCount: events.length,
        queueLength: queue.length,
        crawlLimit,
      });
    }
  }

  return { pages, events };
}
