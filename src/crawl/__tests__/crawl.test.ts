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
