import assert from "node:assert/strict";
import { test } from "vitest";

import type { AuditInputs } from "../../report/report-schema.js";
import { canonicalizeForCrawlIdentity, crawlSite } from "../index.js";
import { PAGINATED_EXPECTED_PATHS, PAGINATED_SITE_ROUTES } from "../../../test/fixtures/paginated-site.js";
import { createRouteAwareFetchMock } from "../../../test/fixtures/fetch-mock.js";

function makeInputs(target: string): AuditInputs {
  return {
    target_type: "url",
    target,
    coverage: "surface",
    max_pages: 30,
    crawl_depth: 5,
    include_patterns: [],
    exclude_patterns: [],
    allowed_domains: [],
    respect_robots: false,
    rendering_mode: "static_html",
    user_agent: "seo-audit-test",
    timeout_ms: 5000,
    locale: {
      language: "pl",
      country: "PL",
    },
    report_format: "json",
    llm_enabled: false,
    baseline_run_id: null,
    brief: {
      text: "fixture",
      focus: {
        primary_url: null,
        primary_keyword: null,
        goal: null,
        current_position: null,
        secondary_urls: [],
      },
      constraints: [],
      weighting_overrides: {
        boost_rules: [],
        boost_categories: [],
      },
    },
  };
}

test("canonicalizeForCrawlIdentity keeps only pagination params and ignores hash", () => {
  const sameA = canonicalizeForCrawlIdentity("https://example.com/o-nas/czytelnia?page=2&utm_source=ads#x");
  const sameB = canonicalizeForCrawlIdentity("https://example.com/o-nas/czytelnia?utm_source=ads&page=2#y");
  const different = canonicalizeForCrawlIdentity("https://example.com/o-nas/czytelnia?page=3&utm_source=ads");

  assert.equal(sameA, "https://example.com/o-nas/czytelnia?page=2");
  assert.equal(sameB, "https://example.com/o-nas/czytelnia?page=2");
  assert.equal(different, "https://example.com/o-nas/czytelnia?page=3");
  assert.notEqual(sameA, different);

  assert.equal(
    canonicalizeForCrawlIdentity("https://example.com/blog?paged=4&utm_campaign=x"),
    "https://example.com/blog?paged=4",
  );
  assert.equal(canonicalizeForCrawlIdentity("https://example.com/blog?p=9"), "https://example.com/blog?p=9");
  assert.equal(
    canonicalizeForCrawlIdentity("https://example.com/blog?sort=desc&page=2&paged=2&p=2&utm=x#frag"),
    "https://example.com/blog?p=2&page=2&paged=2",
  );
  assert.equal(
    canonicalizeForCrawlIdentity("https://example.com/blog?page=2&page=2&utm=x"),
    "https://example.com/blog?page=2&page=2",
  );
});

test("surface crawl visits paginated listing pages and discovers article pages behind them", async () => {
  const baseUrl = "https://fixture.local";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createRouteAwareFetchMock(baseUrl, PAGINATED_SITE_ROUTES);
  try {
    const inputs = makeInputs(`${baseUrl}/`);
    const result = await crawlSite(inputs, [`${baseUrl}/`]);
    const crawled = new Set(
      result.pages.map((page) => {
        const parsed = new URL(page.final_url);
        return `${parsed.pathname}${parsed.search}`;
      }),
    );

    for (const expectedPath of PAGINATED_EXPECTED_PATHS) {
      assert.ok(crawled.has(expectedPath), `expected crawled path: ${expectedPath}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surface crawl deduplicates URLs differing only by non-pagination query params", async () => {
  const baseUrl = "https://fixture.local";
  const routes = [
    {
      path: "/",
      body: "<html><body><a href='/promo?utm_source=aa'>promo aa</a><a href='/promo?utm_source=bb'>promo bb</a></body></html>",
    },
    {
      path: "/promo?utm_source=aa",
      body: "<html><body>promo</body></html>",
    },
    {
      path: "/promo?utm_source=bb",
      body: "<html><body>promo</body></html>",
    },
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = createRouteAwareFetchMock(baseUrl, routes);
  try {
    const inputs = makeInputs(`${baseUrl}/`);
    const result = await crawlSite(inputs, [`${baseUrl}/`]);
    const crawled = result.pages.map((page) => `${new URL(page.final_url).pathname}${new URL(page.final_url).search}`);

    const promoVariants = crawled.filter((entry) => entry.startsWith("/promo"));
    assert.equal(promoVariants.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
