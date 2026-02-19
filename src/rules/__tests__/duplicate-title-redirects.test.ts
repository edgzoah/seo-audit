import assert from "node:assert/strict";
import { test } from "vitest";

import { runRules } from "../index.js";
import type { PageExtract } from "../../report/report-schema.js";

function makePage(input: { url: string; finalUrl?: string; title?: string | null; metaDescription?: string | null }): PageExtract {
  const title = input.title ?? "Psychoterapia par Warszawa";
  const metaDescription = input.metaDescription ?? null;
  return {
    url: input.url,
    final_url: input.finalUrl ?? input.url,
    status: 200,
    title,
    meta_description: metaDescription,
    meta_robots: null,
    canonical: null,
    hreflang_links: [],
    headings_outline: [],
    links: {
      internal_count: 0,
      external_count: 0,
      internal_targets: [],
      external_targets: [],
    },
    images: {
      count: 0,
      missing_alt_count: 0,
      large_image_candidates: [],
    },
    schema: {
      jsonld_blocks: [],
      detected_schema_types: [],
      json_parse_failures: [],
    },
    security: {
      is_https: true,
      mixed_content_candidates: [],
      security_headers_present: [],
      security_headers_missing: [],
    },
    mainText: "",
    wordCountMain: 0,
    firstViewportText: "",
    headingTextConcat: "",
    brandSignals: [],
    outlinksInternal: [],
    outlinksExternal: [],
    inlinksCount: 0,
    inlinksAnchorsTop: [],
    titleText: title ?? "",
    titleLength: title?.length ?? 0,
    metaDescriptionText: metaDescription ?? "",
    metaDescriptionLength: metaDescription?.length ?? 0,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    metaRobotsContent: "",
    xRobotsTagHeader: null,
    canonicalUrl: null,
    jsonLdRawBlocks: [],
    jsonLdParsed: [],
    schemaTypesDetected: [],
    schemaErrors: [],
    htmlLang: "pl",
    linksWithoutAccessibleNameCount: 0,
  };
}

test("runRules does not flag duplicate_title for redirect alias URLs sharing same final_url", async () => {
  const pages: PageExtract[] = [
    makePage({
      url: "https://example.com/psychoterapia/psychoterapia-par",
      finalUrl: "https://example.com/psychoterapia/terapia-par-warszawa",
      title: "Terapia par Warszawa | Ośrodek",
    }),
    makePage({
      url: "https://example.com/psychoterapia/terapia-par-warszawa",
      finalUrl: "https://example.com/psychoterapia/terapia-par-warszawa",
      title: "Terapia par Warszawa | Ośrodek",
    }),
  ];

  const issues = await runRules({
    pages,
    robotsDisallow: [],
    timeoutMs: 1,
    focusUrl: null,
    sitemapUrls: [],
    focusInlinksThreshold: 3,
    serviceMinWords: 300,
    defaultMinWords: 500,
    genericAnchors: null,
    includeSerp: false,
  });

  assert.equal(
    issues.some((issue) => issue.id === "duplicate_title"),
    false,
  );
});

test("runRules does not flag duplicate title/meta for pagination alias page=1", async () => {
  const title = "Szkolenia psychoterapeutyczne | Ośrodek";
  const description = "Szkolenia dla psychoterapeutów i specjalistów pomocy psychologicznej.";
  const pages: PageExtract[] = [
    makePage({
      url: "https://example.com/szkolenia",
      finalUrl: "https://example.com/szkolenia",
      title,
      metaDescription: description,
    }),
    makePage({
      url: "https://example.com/szkolenia?page=1",
      finalUrl: "https://example.com/szkolenia?page=1",
      title,
      metaDescription: description,
    }),
  ];

  const issues = await runRules({
    pages,
    robotsDisallow: [],
    timeoutMs: 1,
    focusUrl: null,
    sitemapUrls: [],
    focusInlinksThreshold: 3,
    serviceMinWords: 300,
    defaultMinWords: 500,
    genericAnchors: null,
    includeSerp: true,
  });

  assert.equal(
    issues.some((issue) => issue.id === "duplicate_title"),
    false,
  );
  assert.equal(
    issues.some((issue) => issue.id === "meta_description_duplicate"),
    false,
  );
});
