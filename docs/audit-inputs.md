# Audit Inputs (Input Contract)

This file defines the inputs that control the audit. Goal: reproducibility — same inputs → same deterministic output.

## 1) Minimal input (enough to run)
- `target_type`: `url` | `local_path`
- `target`: string
- `coverage`: `quick` | `surface` | `full`
- `max_pages`: number
- `crawl_depth`: number
- `allowed_domains`: string[]
- `include_patterns`: string[]
- `exclude_patterns`: string[]
- `respect_robots`: boolean
- `rendering_mode`: `static_html` | `headless`
- `timeout_ms`: number
- `user_agent`: string
- `locale`: { `language`: string, `country`: string }
- `report_format`: `json` | `md` | `llm`
- `baseline_run_id`?: string
- `llm_enabled`: boolean

## 2) Brief / Focus (pre-audit prompt)
- `brief.text`: string (markdown/plain)
- `brief.focus.primary_url`?: string
- `brief.focus.primary_keyword`?: string
- `brief.focus.goal`?: string
- `brief.focus.current_position`?: { `query`: string, `position`?: number, `page`?: number }
- `brief.focus.secondary_urls`?: string[]
- `brief.constraints`?: string[] (e.g., “do not change URL”, “no clickbait”)
- `brief.weighting_overrides`?:
  - `boost_rules`?: string[]
  - `boost_categories`?: string[]

## 3) Coverage semantics
- quick:
  - seeds: start URL + sitemap URLs
  - no link discovery
- surface:
  - link discovery ON
  - pattern sampling (1 URL per pattern)
- full:
  - link discovery ON up to limit

## 4) Thresholds (configured in seo-audit.config.json)
Thresholds live in config, but can be overridden via CLI:
- `focus_min_inlinks`
- `min_words_service_page`, `min_words_other_page`
- `generic_anchors` (list)
- `title_len_target`, `meta_desc_len_target` (heuristics)
- `lcp_good_ms`, `inp_good_ms`, `cls_good` (if Lighthouse)

## 5) Lighthouse (performance)
- `--lighthouse` (flag) enables measurement for home + focus
- If disabled: performance status = “not measured” (never pretend it is 100)

## 6) Determinism constraints
- Issue sorting: severity (error > warning > notice), then rank desc, then id asc
- Evidence: only top N samples (N in config), always in stable order
- URL normalization: remove hash, normalize trailing slash per config policy

## 7) Output paths
- Everything is written to: `runs/<run-id>/`
  - inputs.json
  - brief.md
  - crawl.jsonl
  - pages.json
  - report.json / report.md / report.llm.txt
  - diff.* if baseline