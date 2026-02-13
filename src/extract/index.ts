import { load } from "cheerio";

import type { HeadingOutlineItem, PageExtract } from "../report/report-schema.js";

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

export function extractPageData(html: string, requestedUrl: string, finalUrl: string, status: number): PageExtract {
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
    hreflang_links: hreflangLinks,
    headings_outline: headingsOutline,
    links: {
      internal_count: internalTargets.size,
      external_count: externalTargets.size,
      internal_targets: Array.from(internalTargets),
      external_targets: Array.from(externalTargets),
    },
    images: {
      count: $("img").length,
      missing_alt_count: $("img:not([alt]), img[alt='']").length,
      large_image_candidates: [],
    },
    schema: {
      jsonld_blocks: jsonldBlocks,
      detected_schema_types: Array.from(detectedSchemaTypes),
      json_parse_failures: jsonParseFailures,
    },
    security: {
      is_https: finalUrl.startsWith("https://"),
      mixed_content_candidates: [],
      security_headers_present: [],
      security_headers_missing: [],
    },
  };
}
