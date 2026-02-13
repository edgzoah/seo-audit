# Workflow (Audit Pipeline)

## 0) Inputs
- Load config + CLI flags
- Load brief.md (if provided) and derive focus.primary_url / keyword / goal
- Write `runs/<run-id>/inputs.json` and `runs/<run-id>/brief.md`

## 1) Seed discovery
- Start URL is always a seed
- Optional: robots.txt (disallow + sitemap)
- Optional: sitemap.xml (urlset + sitemapindex)
- Apply filters: allowed_domains, include_patterns, exclude_patterns
- Coverage:
  - quick: start + sitemap (no link discovery)
  - surface: link discovery + pattern sampling
  - full: link discovery up to limit

## 2) Crawl
- BFS queue with limits: max_pages, crawl_depth, timeout
- Write events to `crawl.jsonl` (status, redirect, timing)
- For surface: patternize URL and fetch 1 sample per pattern

## 3) Extract (per page)
- Write `pages.json` (summaries)
- Extraction includes:
  - title/description/robots/canonical/hreflang
  - H1–H3 outline + headingTextConcat
  - mainText + wordCountMain + firstViewportText
  - json-ld (raw + parsed + types + errors)
  - internal/external outlinks with anchors
  - a11y baseline: html lang, DOM links without accessible name
  - response headers: X-Robots-Tag and security headers
  - OG tags (optional)

## 4) Build internal link graph (post-crawl)
- Compute inlinksCount per URL
- Build anchor histogram (top N) + detect generic anchors
- Compute focus metrics: inlinks, sources, anchor quality

## 5) Deterministic rules
- Run rules across categories:
  - indexation_conflicts
  - seo/snippet (mismatch > length)
  - intent/content_quality (thin content, service-page sections)
  - internal_links (orphan, focus inlinks)
  - schema_quality (incomplete/invalid)
  - security (headers/mixed content)
  - a11y baseline
- Every rule must include evidence (counts + top N samples)

## 6) Focus-aware weighting + scoring
- Tag issues: focus / inlink / global
- Total score 0–100 + per-category scores
- Focus score 0–100 (focus + neighborhood)
- Do not output performance=100 when not measured (mark as “not measured”)

## 7) Performance measurement (optional)
- Lighthouse for home + focus (if focus exists)
- Store metrics in PageExtract.lighthouse and the report summary

## 8) LLM proposals (optional, Codex CLI)
- Input: brief + focus page extract + link graph + top issues
- Output packs:
  - Focus SERP pack (titles/descriptions + rationale)
  - Focus outline pack (H2/H3 + FAQ)
  - Internal link plan (10 sources + anchor + context)
  - Entity/local pack (checklist + schema suggestions consistent with content)
  - Cannibalization flags (if enough data)
- The LLM does not edit code; proposals only.

## 9) Report generation
- `report.json` (canonical)
- `report.md` (readable)
- `report.llm.txt` (compact)
- If baseline: `diff.json` + `diff.llm.txt`

## 10) Iteration
- Re-run the audit after changes are implemented
- Review diff: score delta + resolved/new/regressed