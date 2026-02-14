import assert from "node:assert/strict";
import { test } from "vitest";

import { buildDeterministicInternalLinkPlan, buildInternalLinkGraph } from "../run.js";
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

test("buildInternalLinkGraph does not inflate summary percentages from occurrences", () => {
  const target = "https://example.com/cennik";
  const pages = [
    makePage({
      url: "https://example.com/a",
      outlinksInternal: [{ targetUrl: target, anchorText: "Cennik", rel: "", isNavLikely: true, occurrences: 40 }],
    }),
    makePage({
      url: "https://example.com/b",
      outlinksInternal: [{ targetUrl: target, anchorText: "Oferta", rel: "", isNavLikely: false, occurrences: 1 }],
    }),
    makePage({ url: target }),
  ];

  const graph = buildInternalLinkGraph(pages, target);
  assert.equal(graph.internalLinksSummary.navLikelyInlinksPercent, 50);
  assert.deepEqual(graph.internalLinksSummary.topAnchors, [
    { anchor: "cennik", count: 1 },
    { anchor: "oferta", count: 1 },
  ]);
});

test("buildInternalLinkGraph sorts top inlink sources deterministically by count then URL", () => {
  const target = "https://example.com/cennik";
  const pages = [
    makePage({
      url: "https://example.com/z-source",
      outlinksInternal: [{ targetUrl: target, anchorText: "Cennik", rel: "", isNavLikely: false, occurrences: 1 }],
    }),
    makePage({
      url: "https://example.com/a-source",
      outlinksInternal: [{ targetUrl: target, anchorText: "Cennik", rel: "", isNavLikely: false, occurrences: 1 }],
    }),
    makePage({ url: target }),
  ];

  const graph = buildInternalLinkGraph(pages, target);
  assert.deepEqual(graph.topInlinkSourcesToFocus, ["https://example.com/a-source", "https://example.com/z-source"]);
});

test("buildDeterministicInternalLinkPlan suggests source pages that do not yet link to focus", () => {
  const focus = "https://example.com/psychoterapia/terapia-par-warszawa";
  const pages = [
    makePage({
      url: focus,
    }),
    makePage({
      url: "https://example.com/o-nas/czytelnia/relacje",
      outlinksInternal: [],
    }),
    makePage({
      url: "https://example.com/psychoterapia/terapia-doroslych-warszawa",
      outlinksInternal: [],
    }),
    makePage({
      url: "https://example.com/kontakt",
      outlinksInternal: [{ targetUrl: focus, anchorText: "terapia par warszawa", rel: "", isNavLikely: true, occurrences: 1 }],
    }),
  ].map((page) => {
    if (page.final_url.endsWith("/relacje")) {
      return { ...page, titleText: "Jak relacje wpływają na terapię par", mainText: "terapia par warszawa relacje konflikt komunikacja", wordCountMain: 500 };
    }
    if (page.final_url.endsWith("/terapia-doroslych-warszawa")) {
      return { ...page, titleText: "Psychoterapia dorosłych w Warszawie", mainText: "psychoterapia warszawa terapia par wsparcie", wordCountMain: 450 };
    }
    return page;
  });

  const plan = buildDeterministicInternalLinkPlan({
    pages,
    focusUrl: focus,
    focusKeyword: "terapia par warszawa",
    maxItems: 5,
  });

  assert.ok(plan.length >= 1);
  assert.ok(plan.every((item) => item.sourceUrl !== focus));
  assert.ok(plan.every((item) => item.sourceUrl !== "https://example.com/kontakt"));
  assert.ok(plan.some((item) => item.suggestedAnchor.toLowerCase().includes("terapia par warszawa")));
});
