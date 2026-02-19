import assert from "node:assert/strict";
import { test } from "vitest";

import { runRules } from "../index.js";
import type { PageExtract } from "../../report/report-schema.js";

function makePage(input: { title: string; metaDescription: string }): PageExtract {
  return {
    url: "https://example.com/oferta",
    final_url: "https://example.com/oferta",
    status: 200,
    title: input.title,
    meta_description: input.metaDescription,
    meta_robots: null,
    canonical: null,
    hreflang_links: [],
    headings_outline: [{ level: 1, text: "Oferta" }],
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
    mainText: "Treść strony wystarczająco długa, aby nie aktywować thin_content.",
    wordCountMain: 1000,
    firstViewportText: "",
    headingTextConcat: "Oferta",
    brandSignals: [],
    outlinksInternal: [],
    outlinksExternal: [],
    inlinksCount: 2,
    inlinksAnchorsTop: [],
    titleText: input.title,
    titleLength: input.title.length,
    metaDescriptionText: input.metaDescription,
    metaDescriptionLength: input.metaDescription.length,
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

async function issuesFor(input: { title: string; metaDescription: string }) {
  return runRules({
    pages: [makePage(input)],
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
}

test("title length soft threshold produces warning and hard threshold produces error", async () => {
  const softIssues = await issuesFor({
    title: "A".repeat(61),
    metaDescription: "B".repeat(140),
  });
  const soft = softIssues.find((issue) => issue.id === "title_length_out_of_range");
  assert.ok(soft);
  assert.equal(soft.severity, "warning");

  const hardIssues = await issuesFor({
    title: "A".repeat(71),
    metaDescription: "B".repeat(140),
  });
  const hard = hardIssues.find((issue) => issue.id === "title_length_out_of_range");
  assert.ok(hard);
  assert.equal(hard.severity, "error");
});

test("meta description soft threshold produces warning and hard threshold produces error", async () => {
  const softIssues = await issuesFor({
    title: "Krótki tytuł strony",
    metaDescription: "B".repeat(161),
  });
  const soft = softIssues.find((issue) => issue.id === "description_length_out_of_range");
  assert.ok(soft);
  assert.equal(soft.severity, "warning");

  const hardIssues = await issuesFor({
    title: "Krótki tytuł strony",
    metaDescription: "B".repeat(201),
  });
  const hard = hardIssues.find((issue) => issue.id === "description_length_out_of_range");
  assert.ok(hard);
  assert.equal(hard.severity, "error");
});

