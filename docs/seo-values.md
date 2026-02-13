# SEO Values (Audit Constitution)

This project must produce an audit that is **useful for improving Google visibility**, not just technical diagnostics. The core audit is deterministic; the LLM is for proposals, not for “deciding facts”.

## 1) Priority hierarchy
1. **Indexability & crawlability** (visibility blockers): noindex, robots blocks, canonicals pointing to errors, 404/soft-404, redirect chains, wrong status codes.
2. **Focus Page Uplift** (brief target page): title↔H1 consistency, intent coverage, internal linking to the focus page, snippet quality.
3. **Content clarity & intent match**: heading structure, completeness of sections for the page type (local service), thin content, duplicate content.
4. **Entity/Trust/Local**: trust signals (business details, team, address), NAP consistency, correct and complete schema.
5. **Performance & UX**: CWV (LCP/INP/CLS) for home + focus (if measured), baseline a11y as a “quality multiplier”.

## 2) Hard rules vs heuristics
### Hard (high-rank ERROR/WARNING)
- noindex / robots blocking on pages meant to rank
- canonical points to a non-200 URL or an unintended URL
- conflicts between meta robots and X-Robots-Tag
- redirect chains, soft-404, widespread 404 from internal links
- schema clearly broken / invalid (e.g., unparseable JSON-LD)

### Heuristics (lower-rank NOTICE/WARNING)
- title/description length (never as a “Google requirement”, only snippet risk)
- missing OG/Twitter
- missing breadcrumb schema (depends on page type)
- missing informational sections on service pages (heuristic detection)

## 3) Default thresholds (configurable)
### Snippets (heuristics)
- `title_len_target`: 20–65 chars (heuristic)
- `meta_desc_len_target`: 70–165 chars (heuristic)
- `title_h1_similarity_min`: 0.25 (token similarity; heuristic)
- `keyword_repetition_max`: 3 (for “spammy description/title”)

### Content
- `min_words_service_page`: 300
- `min_words_other_page`: 150
- `duplicate_block_min_chars`: 180
- `duplicate_block_min_occurrences`: 3

### Internal linking
- `focus_min_inlinks`: 5
- `near_orphan_inlinks_max`: 1
- `generic_anchor_ratio_warn`: 0.40
- `nav_only_inlinks_ratio_notice`: 0.70

### A11y baseline
- `max_links_without_accessible_name`: 3
- `generic_alt_words`: ["image","photo","banner","graphic","picture"]
- `min_alt_length`: 4
- `require_html_lang`: true

### Performance (if Lighthouse is measured)
- Report values + status (good/needs improvement/poor) using configurable thresholds:
  - `lcp_good_ms`: 2500
  - `inp_good_ms`: 200
  - `cls_good`: 0.10

## 4) LLM rules (do not violate)
- The LLM must not invent data (rank positions, competitors, metrics) and must not state “Google requires X length”.
- The LLM only uses audit evidence + the brief.
- The LLM must output JSON matching the report schema.
- Proposals must stay consistent with on-page content; no keyword stuffing, no clickbait.

## 5) Definition of success for the Focus Page
The focus page is “ready” when:
- no critical indexation conflicts
- `inlinks_to_focus >= focus_min_inlinks`
- no `title_h1_mismatch`
- `wordCountMain >= min_words_service_page` (for service pages)
- alt text is filled for key images (not necessarily every image)
- (optional) CWV for focus/home reaches “good” or improves after iteration