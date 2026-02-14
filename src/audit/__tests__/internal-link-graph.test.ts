import assert from "node:assert/strict";
import { test } from "vitest";

import { buildInternalLinkGraph } from "../run.js";
import type { PageExtract, PageOutlinkInternal } from "../../report/report-schema.js";

function makePage(input: { url: string; outlinksInternal?: PageOutlinkInternal[] }): PageExtract {
  return {
    url: input.url,
    final_url: input.url,
    status: 200,
    title: "Fixture",
    meta_description: null,
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
    outlinksInternal: input.outlinksInternal ?? [],
    outlinksExternal: [],
    inlinksCount: 0,
    inlinksAnchorsTop: [],
    titleText: "Fixture",
    titleLength: 7,
    metaDescriptionText: "",
    metaDescriptionLength: 0,
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

test("buildInternalLinkGraph counts unique source-target inlinks only once", () => {
  const target = "https://example.com/cennik";
  const source = "https://example.com/o-nas/czytelnia";
  const pages = [
    makePage({
      url: source,
      outlinksInternal: [
        { targetUrl: target, anchorText: "Cennik", rel: "", isNavLikely: true, occurrences: 4 },
        { targetUrl: target, anchorText: "Oferta i cennik", rel: "", isNavLikely: false, occurrences: 1 },
      ],
    }),
    makePage({ url: target }),
  ];

  const graph = buildInternalLinkGraph(pages, target);
  const targetPage = graph.pages.find((page) => page.final_url === target);
  assert.ok(targetPage);
  assert.equal(targetPage.inlinksCount, 1);
  assert.deepEqual(
    targetPage.inlinksAnchorsTop.map((entry) => entry.anchor),
    ["cennik", "oferta i cennik"],
  );
  assert.equal(graph.focusInlinksCount, 1);
  assert.deepEqual(graph.topInlinkSourcesToFocus, [source]);
});

test("buildInternalLinkGraph increases inlinks for different source pages", () => {
  const target = "https://example.com/cennik";
  const sourceA = "https://example.com/a";
  const sourceB = "https://example.com/b";
  const pages = [
    makePage({
      url: sourceA,
      outlinksInternal: [{ targetUrl: target, anchorText: "Cennik", rel: "", isNavLikely: false, occurrences: 3 }],
    }),
    makePage({
      url: sourceB,
      outlinksInternal: [{ targetUrl: target, anchorText: "Oferta", rel: "", isNavLikely: false, occurrences: 1 }],
    }),
    makePage({ url: target }),
  ];

  const graph = buildInternalLinkGraph(pages, target);
  const targetPage = graph.pages.find((page) => page.final_url === target);
  assert.ok(targetPage);
  assert.equal(targetPage.inlinksCount, 2);
  assert.equal(graph.focusInlinksCount, 2);
});

test("buildInternalLinkGraph internal summary snapshot remains stable after dedup", () => {
  const target = "https://example.com/cennik";
  const pages = [
    makePage({
      url: "https://example.com/",
      outlinksInternal: [{ targetUrl: target, anchorText: "Cennik", rel: "", isNavLikely: true, occurrences: 5 }],
    }),
    makePage({
      url: "https://example.com/o-nas",
      outlinksInternal: [{ targetUrl: target, anchorText: "", rel: "", isNavLikely: false, occurrences: 2 }],
    }),
    makePage({ url: target }),
  ];

  const graph = buildInternalLinkGraph(pages, target);
  assert.deepEqual(graph.internalLinksSummary, {
    orphanPagesCount: 1,
    nearOrphanPagesCount: 1,
    navLikelyInlinksPercent: 50,
    percentGenericAnchors: 0,
    percentEmptyAnchors: 50,
    topAnchors: [
      { anchor: "", count: 1 },
      { anchor: "cennik", count: 1 },
    ],
  });
});
