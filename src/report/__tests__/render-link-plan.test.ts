import assert from "node:assert/strict";
import { test } from "vitest";

import { renderReportHtml } from "../html.js";
import { renderReportMarkdown } from "../md.js";
import type { Report } from "../report-schema.js";

function makeReport(): Report {
  return {
    run_id: "run-test",
    started_at: new Date("2026-02-14T00:00:00.000Z").toISOString(),
    finished_at: new Date("2026-02-14T00:01:00.000Z").toISOString(),
    inputs: {
      target_type: "url",
      target: "https://example.com",
      coverage: "surface",
      max_pages: 10,
      crawl_depth: 2,
      include_patterns: [],
      exclude_patterns: [],
      allowed_domains: [],
      respect_robots: false,
      rendering_mode: "static_html",
      user_agent: "test-agent",
      timeout_ms: 5000,
      locale: { language: "pl", country: "PL" },
      report_format: "md",
      llm_enabled: false,
      baseline_run_id: null,
      brief: {
        text: "test",
        focus: { primary_url: null, primary_keyword: null, goal: null, current_position: null, secondary_urls: [] },
        constraints: [],
        weighting_overrides: { boost_rules: [], boost_categories: [] },
      },
    },
    summary: {
      score_total: 80,
      score_by_category: { seo: 80, technical: 90, content: 70, security: 60, performance: 0 },
      pages_crawled: 1,
      errors: 0,
      warnings: 0,
      notices: 0,
    },
    issues: [],
    pages: [],
    page_extracts: [],
    internal_link_plan: [
      {
        sourceUrl: "https://example.com/blog/a",
        suggestedAnchor: "terapia par warszawa",
        suggestedSentenceContext: "Dodaj link do oferty terapii par.",
      },
    ],
  };
}

test("renderReportMarkdown includes deterministic internal link plan", () => {
  const report = makeReport();
  const rendered = renderReportMarkdown(report);

  assert.match(rendered, /## Internal Link Plan/);
  assert.match(rendered, /https:\/\/example\.com\/blog\/a/);
  assert.match(rendered, /terapia par warszawa/);
});

test("renderReportHtml prefers LLM internal_link_plan over deterministic plan", () => {
  const report = makeReport();
  report.proposed_packs = {
    internal_link_plan: [
      {
        sourceUrl: "https://example.com/llm-source",
        suggestedAnchor: "psychoterapia małżeńska",
        suggestedSentenceContext: "LLM context",
      },
    ],
  };

  const rendered = renderReportHtml(report);
  assert.match(rendered, /Internal Link Plan/);
  assert.match(rendered, /https:\/\/example\.com\/llm-source/);
  assert.doesNotMatch(rendered, /https:\/\/example\.com\/blog\/a/);
});
