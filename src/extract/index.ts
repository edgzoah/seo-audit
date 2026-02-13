import { load, type CheerioAPI } from "cheerio";

import type {
  HeadingOutlineItem,
  PageExtract,
  PageOutlinkExternal,
  PageOutlinkInternal,
  SchemaError,
} from "../report/report-schema.js";

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
] as const;

const NOISE_SELECTORS = "nav,header,footer,aside,.menu,.nav,.footer";

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

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
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

  return Array.from(candidates).sort(compareStrings);
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

  return Array.from(candidates).sort(compareStrings);
}

function extractMainText(root: CheerioAPI): string {
  const bodyHtml = root("body").html() ?? root.root().html() ?? "";
  const $ = load(bodyHtml);
  $(NOISE_SELECTORS).remove();

  const preferredSelectors = ["main", "article", "#content"];
  let bestText = "";

  for (const selector of preferredSelectors) {
    $(selector).each((_, element) => {
      const text = normalizeText($(element).text());
      if (text.length > bestText.length) {
        bestText = text;
      }
    });
  }

  if (bestText.length > 0) {
    return bestText;
  }

  const candidateSelectors = ["section", "div", "main", "article", "body"];
  for (const selector of candidateSelectors) {
    $(selector).each((_, element) => {
      const text = normalizeText($(element).text());
      if (text.length > bestText.length) {
        bestText = text;
      }
    });
  }

  return bestText;
}

function isLikelyNavLink($: CheerioAPI, element: any): boolean {
  const parentChain = $(element)
    .parents()
    .toArray()
    .map((node) => {
      const tag = ((node as { tagName?: string; name?: string }).tagName ?? (node as { name?: string }).name ?? "").toLowerCase();
      const id = ($(node).attr("id") ?? "").toLowerCase();
      const className = ($(node).attr("class") ?? "").toLowerCase();
      return `${tag} ${id} ${className}`;
    })
    .join(" ");

  return /\b(nav|menu|header|footer|breadcrumbs?)\b/i.test(parentChain);
}

function collectBrandSignals(input: {
  $: CheerioAPI;
  titleText: string;
  footerText: string;
  schemaParsed: Record<string, unknown>[];
}): string[] {
  const signals = new Set<string>();

  for (const segment of input.titleText.split(/[|\-–—•]/)) {
    const normalized = normalizeText(segment);
    if (normalized.length >= 2 && normalized.length <= 80) {
      signals.add(normalized);
    }
  }

  const footerNormalized = normalizeText(input.footerText);
  if (footerNormalized.length >= 2) {
    const copyrightMatch = footerNormalized.match(/(?:©|copyright)\s*\d{2,4}\s*(.+)$/i);
    if (copyrightMatch?.[1]) {
      const candidate = normalizeText(copyrightMatch[1]);
      if (candidate.length >= 2 && candidate.length <= 80) {
        signals.add(candidate);
      }
    }
  }

  input.$("img[alt]").each((_, element) => {
    const alt = normalizeText(input.$(element).attr("alt") ?? "");
    if (alt.length > 0 && /logo/i.test(alt) && alt.length <= 80) {
      signals.add(alt);
    }
  });

  const collectOrgName = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectOrgName(item);
      }
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    const atType = record["@type"];
    const types = Array.isArray(atType) ? atType : [atType];
    const isOrgLike = types.some((type) => typeof type === "string" && ["Organization", "LocalBusiness"].includes(type));

    if (isOrgLike && typeof record.name === "string") {
      const normalized = normalizeText(record.name);
      if (normalized.length >= 2 && normalized.length <= 80) {
        signals.add(normalized);
      }
    }

    if (record["@graph"]) {
      collectOrgName(record["@graph"]);
    }
  };

  for (const schemaObject of input.schemaParsed) {
    collectOrgName(schemaObject);
  }

  return Array.from(signals).sort(compareStrings);
}

function parseSchemaJsonLd($: CheerioAPI): {
  jsonLdRawBlocks: string[];
  jsonLdParsed: Record<string, unknown>[];
  schemaTypesDetected: string[];
  schemaErrors: SchemaError[];
  legacyJsonParseFailures: string[];
} {
  const jsonLdRawBlocks: string[] = [];
  const jsonLdParsed: Record<string, unknown>[] = [];
  const schemaTypeSet = new Set<string>();
  const schemaErrors: SchemaError[] = [];
  const legacyJsonParseFailures: string[] = [];

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
      schemaTypeSet.add(atType);
    } else if (Array.isArray(atType)) {
      for (const typeValue of atType) {
        if (typeof typeValue === "string") {
          schemaTypeSet.add(typeValue);
        }
      }
    }

    if (record["@graph"]) {
      collectTypes(record["@graph"]);
    }
  };

  $("script[type='application/ld+json']").each((index, element) => {
    const raw = $(element).html()?.trim() ?? "";
    if (!raw) {
      return;
    }

    jsonLdRawBlocks.push(raw);

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        jsonLdParsed.push(parsed as Record<string, unknown>);
      }
      collectTypes(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      legacyJsonParseFailures.push(message);
      schemaErrors.push({
        message,
        pointer: `script[type=application/ld+json][${index}]`,
      });
    }
  });

  return {
    jsonLdRawBlocks,
    jsonLdParsed,
    schemaTypesDetected: Array.from(schemaTypeSet).sort(compareStrings),
    schemaErrors,
    legacyJsonParseFailures,
  };
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
  const titleText = title ?? "";

  const metaDescription = $("meta[name='description']").attr("content")?.trim() ?? null;
  const metaDescriptionText = metaDescription ?? "";

  const metaRobots = $("meta[name='robots']").attr("content")?.trim() ?? null;
  const canonical = $("link[rel='canonical']").attr("href")?.trim() ?? null;
  const canonicalUrl = canonical ? safeUrl(finalUrl, canonical) ?? canonical : null;

  const ogTitle = $("meta[property='og:title']").attr("content")?.trim() ?? null;
  const ogDescription = $("meta[property='og:description']").attr("content")?.trim() ?? null;
  const ogImageRaw = $("meta[property='og:image']").attr("content")?.trim() ?? null;
  const ogImage = ogImageRaw ? safeUrl(finalUrl, ogImageRaw) ?? ogImageRaw : null;

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

  const headingTextConcat = headingsOutline
    .map((item) => item.text)
    .filter((item) => item.length > 0)
    .join(" ");

  const internalTargets = new Set<string>();
  const externalTargets = new Set<string>();
  const outlinksInternal: PageOutlinkInternal[] = [];
  const outlinksExternal: PageOutlinkExternal[] = [];
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

    const anchorText = normalizeText($(element).text());
    const rel = normalizeText($(element).attr("rel") ?? "");
    const targetHost = new URL(resolved).host;

    if (targetHost === finalHost) {
      internalTargets.add(resolved);
      outlinksInternal.push({
        targetUrl: resolved,
        anchorText,
        rel,
        isNavLikely: isLikelyNavLink($, element),
      });
      return;
    }

    externalTargets.add(resolved);
    outlinksExternal.push({
      targetUrl: resolved,
      anchorText,
      rel,
    });
  });

  const schema = parseSchemaJsonLd($);
  const footerText = normalizeText($("footer").text());

  const mainText = extractMainText($);
  const words = mainText.length > 0 ? mainText.split(/\s+/).filter((token) => token.length > 0) : [];
  const firstViewportText = mainText.slice(0, 300);

  const normalizedHeaders = normalizeHeaders(responseHeaders);
  const securityHeadersPresent = SECURITY_HEADERS.filter((header) => Boolean(normalizedHeaders[header]));
  const securityHeadersMissing = SECURITY_HEADERS.filter((header) => !normalizedHeaders[header]);

  const linksWithoutAccessibleNameCount = $("a[href]")
    .toArray()
    .filter((element) => {
      const text = normalizeText($(element).text());
      const ariaLabel = normalizeText($(element).attr("aria-label") ?? "");
      const titleAttr = normalizeText($(element).attr("title") ?? "");
      return text.length === 0 && ariaLabel.length === 0 && titleAttr.length === 0;
    }).length;

  return {
    url: requestedUrl,
    final_url: finalUrl,
    status,
    title,
    meta_description: metaDescription,
    meta_robots: metaRobots,
    canonical,
    hreflang_links: hreflangLinks.sort(compareStrings),
    headings_outline: headingsOutline,
    links: {
      internal_count: internalTargets.size,
      external_count: externalTargets.size,
      internal_targets: Array.from(internalTargets).sort(compareStrings),
      external_targets: Array.from(externalTargets).sort(compareStrings),
    },
    images: {
      count: $("img").length,
      missing_alt_count: $("img:not([alt]), img[alt='']").length,
      large_image_candidates: collectLargeImageCandidates(html, finalUrl),
    },
    schema: {
      jsonld_blocks: schema.jsonLdRawBlocks,
      detected_schema_types: schema.schemaTypesDetected,
      json_parse_failures: schema.legacyJsonParseFailures,
    },
    security: {
      is_https: finalUrl.startsWith("https://"),
      mixed_content_candidates: collectMixedContentCandidates(html, finalUrl),
      security_headers_present: [...securityHeadersPresent],
      security_headers_missing: [...securityHeadersMissing],
    },
    mainText,
    wordCountMain: words.length,
    firstViewportText,
    headingTextConcat,
    brandSignals: collectBrandSignals({
      $,
      titleText,
      footerText,
      schemaParsed: schema.jsonLdParsed,
    }),
    outlinksInternal: outlinksInternal.sort((a, b) => {
      const targetDelta = compareStrings(a.targetUrl, b.targetUrl);
      if (targetDelta !== 0) {
        return targetDelta;
      }
      const anchorDelta = compareStrings(a.anchorText, b.anchorText);
      if (anchorDelta !== 0) {
        return anchorDelta;
      }
      return Number(a.isNavLikely) - Number(b.isNavLikely);
    }),
    outlinksExternal: outlinksExternal.sort((a, b) => {
      const targetDelta = compareStrings(a.targetUrl, b.targetUrl);
      if (targetDelta !== 0) {
        return targetDelta;
      }
      return compareStrings(a.anchorText, b.anchorText);
    }),
    inlinksCount: 0,
    inlinksAnchorsTop: [],
    titleText,
    titleLength: titleText.length,
    metaDescriptionText,
    metaDescriptionLength: metaDescriptionText.length,
    ogTitle,
    ogDescription,
    ogImage,
    metaRobotsContent: metaRobots ?? "",
    xRobotsTagHeader: normalizedHeaders["x-robots-tag"] ?? null,
    canonicalUrl,
    jsonLdRawBlocks: schema.jsonLdRawBlocks,
    jsonLdParsed: schema.jsonLdParsed,
    schemaTypesDetected: schema.schemaTypesDetected,
    schemaErrors: schema.schemaErrors,
    htmlLang: $("html").attr("lang")?.trim() ?? null,
    linksWithoutAccessibleNameCount,
    lighthouse: undefined,
  };
}
