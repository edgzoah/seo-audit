import { loadConfig } from "../config/index.js";
import type { AuditInputs } from "../report/report-schema.js";

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

    const disallowMatch = trimmed.match(/^disallow\s*:\s*(.+)$/i);
    if (disallowMatch?.[1]) {
      const rule = disallowMatch[1].trim();
      if (rule.length > 0 && !rule.includes("*")) {
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
