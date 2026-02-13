import { load } from "cheerio";

import type { HeadingOutlineItem, PageExtract } from "../report/report-schema.js";

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
] as const;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeUrl(baseUrl: string, href: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function collectMixedContentCandidates(html: string, finalUrl: string): string[] {
  if (!finalUrl.startsWith("https://")) {
    return [];
  }

  const $ = load(html);
  const candidates = new Set<string>();

  const selectors: Array<{ selector: string; attr: "src" | "href" }> = [
    { selector: "img[src]", attr: "src" },
    { selector: "script[src]", attr: "src" },
    { selector: "link[href]", attr: "href" },
    { selector: "iframe[src]", attr: "src" },
  ];

  for (const entry of selectors) {
    $(entry.selector).each((_, element) => {
      const raw = $(element).attr(entry.attr)?.trim();
      if (!raw) {
        return;
      }
      const resolved = safeUrl(finalUrl, raw);
      if (resolved && resolved.startsWith("http://")) {
        candidates.add(resolved);
      }
    });
  }

  return Array.from(candidates).sort((a, b) => a.localeCompare(b, "en"));
}

function collectLargeImageCandidates(html: string, finalUrl: string): string[] {
  const $ = load(html);
  const candidates = new Set<string>();

  $("img[src]").each((_, element) => {
    const rawSrc = $(element).attr("src")?.trim();
    if (!rawSrc) {
      return;
    }

    const width = Number.parseInt($(element).attr("width") ?? "", 10);
    const height = Number.parseInt($(element).attr("height") ?? "", 10);
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      return;
    }

    if (width * height < 1_000_000) {
      return;
    }

    const resolved = safeUrl(finalUrl, rawSrc);
    if (resolved) {
      candidates.add(resolved);
    }
  });

  return Array.from(candidates).sort((a, b) => a.localeCompare(b, "en"));
}

function normalizeHeaders(responseHeaders?: Record<string, string>): Record<string, string> {
  if (!responseHeaders) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(responseHeaders)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

export function extractPageData(
  html: string,
  requestedUrl: string,
  finalUrl: string,
  status: number,
  responseHeaders?: Record<string, string>,
): PageExtract {
  const $ = load(html);

  const titleRaw = $("title").first().text();
  const title = titleRaw ? normalizeText(titleRaw) : null;

  const metaDescription = $("meta[name='description']").attr("content")?.trim() ?? null;
  const metaRobots = $("meta[name='robots']").attr("content")?.trim() ?? null;
  const canonical = $("link[rel='canonical']").attr("href")?.trim() ?? null;

  const hreflangLinks = $("link[rel='alternate'][hreflang]")
    .toArray()
    .map((el) => $(el).attr("href")?.trim() ?? "")
    .filter((href) => href.length > 0)
    .map((href) => safeUrl(finalUrl, href) ?? href);

  const headingsOutline: HeadingOutlineItem[] = [];
  $("h1, h2, h3").each((index, element) => {
    const node = element as { tagName?: string; name?: string };
    const tagName = (node.tagName ?? node.name ?? "h1").toLowerCase();
    const level = Number(tagName.replace("h", ""));
    const text = normalizeText($(element).text());

    headingsOutline.push({
      level,
      text,
      order: index + 1,
    });
  });

  const internalTargets = new Set<string>();
  const externalTargets = new Set<string>();
  const finalHost = new URL(finalUrl).host;

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      return;
    }

    const resolved = safeUrl(finalUrl, href);
    if (!resolved) {
      return;
    }

    const targetHost = new URL(resolved).host;
    if (targetHost === finalHost) {
      internalTargets.add(resolved);
    } else {
      externalTargets.add(resolved);
    }
  });

  const normalizedHeaders = normalizeHeaders(responseHeaders);
  const securityHeadersPresent = SECURITY_HEADERS.filter((header) => Boolean(normalizedHeaders[header]));
  const securityHeadersMissing = SECURITY_HEADERS.filter((header) => !normalizedHeaders[header]);

  const jsonldBlocks: string[] = [];
  const detectedSchemaTypes = new Set<string>();
  const jsonParseFailures: string[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).html()?.trim() ?? "";
    if (!raw) {
      return;
    }

    jsonldBlocks.push(raw);

    try {
      const parsed = JSON.parse(raw) as unknown;

      const collectTypes = (value: unknown): void => {
        if (Array.isArray(value)) {
          for (const item of value) {
            collectTypes(item);
          }
          return;
        }

        if (!value || typeof value !== "object") {
          return;
        }

        const record = value as Record<string, unknown>;
        const atType = record["@type"];

        if (typeof atType === "string") {
          detectedSchemaTypes.add(atType);
        } else if (Array.isArray(atType)) {
          for (const typeValue of atType) {
            if (typeof typeValue === "string") {
              detectedSchemaTypes.add(typeValue);
            }
          }
        }

        if (record["@graph"]) {
          collectTypes(record["@graph"]);
        }
      };

      collectTypes(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonParseFailures.push(message);
    }
  });

  return {
    url: requestedUrl,
    final_url: finalUrl,
    status,
    title,
    meta_description: metaDescription,
    meta_robots: metaRobots,
    canonical,
    hreflang_links: hreflangLinks.sort((a, b) => a.localeCompare(b, "en")),
    headings_outline: headingsOutline,
    links: {
      internal_count: internalTargets.size,
      external_count: externalTargets.size,
      internal_targets: Array.from(internalTargets).sort((a, b) => a.localeCompare(b, "en")),
      external_targets: Array.from(externalTargets).sort((a, b) => a.localeCompare(b, "en")),
    },
    images: {
      count: $("img").length,
      missing_alt_count: $("img:not([alt]), img[alt='']").length,
      large_image_candidates: collectLargeImageCandidates(html, finalUrl),
    },
    schema: {
      jsonld_blocks: jsonldBlocks,
      detected_schema_types: Array.from(detectedSchemaTypes).sort((a, b) => a.localeCompare(b, "en")),
      json_parse_failures: jsonParseFailures,
    },
    security: {
      is_https: finalUrl.startsWith("https://"),
      mixed_content_candidates: collectMixedContentCandidates(html, finalUrl),
      security_headers_present: [...securityHeadersPresent],
      security_headers_missing: [...securityHeadersMissing],
    },
  };
}
