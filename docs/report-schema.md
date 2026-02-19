# Report Schema

This document is the human-readable contract for the canonical report produced by the CLI.
The canonical machine schema is defined in `src/report/report-schema.ts`.

## 1) Canonical artifacts

Every run writes:

- `runs/<run-id>/inputs.json` — the exact inputs used
- `runs/<run-id>/brief.md` — the pre-audit brief (if any)
- `runs/<run-id>/crawl.jsonl` — crawl log (streaming)
- `runs/<run-id>/pages.json` — extracted page-level data (may be large)
- `runs/<run-id>/report.json` — canonical report (this schema)
- `runs/<run-id>/report.md` — readable report
- `runs/<run-id>/report.llm.txt` — compact LLM-optimized report

If a baseline is used:

- `runs/<run-id>/diff.json`
- `runs/<run-id>/diff.llm.txt`

## 2) Determinism guarantees

The report must be reproducible for the same inputs and the same site state:

- Issues are sorted deterministically:
  1) severity (`error` > `warning` > `notice`)
  2) rank (descending)
  3) id (ascending)
- Evidence lists are stable:
  - only top N samples are included (N is configurable)
  - samples are sorted deterministically (usually by URL, then by text)
- URL normalization rules are applied consistently (hash removed; trailing slash policy consistent).

LLM content is optional and does not affect deterministic issues/scoring.

## 3) Root object (`Report`)

### Required fields

- `run_id` (string): unique id for the run (also used as folder name)
- `started_at` (string): ISO timestamp
- `finished_at` (string): ISO timestamp
- `inputs` (`AuditInputs`): the exact resolved inputs for the run
- `summary` (`Summary`): scoring and counts
- `issues` (`Issue[]`): the canonical list of findings
- `pages` (`PageSummary[]`): compact listing of crawled pages

### Optional fields

- `proposed_fixes` (`ProposedFix[]`): LLM-generated proposals (text-only, no code changes)
- `prioritized_actions` (`Action[]`): LLM-generated prioritized plan

## 4) Summary (`Summary`)

- `score_total` (number 0–100)
- `score_by_category` (Record<string, number>): category scores (0–100)
- `pages_crawled` (number)
- `errors`, `warnings`, `notices` (number)

Optional focus block:

- `focus.primary_url` (string)
- `focus.focus_score` (number 0–100)
- `focus.focus_top_issues` (string[]): list of issue ids
- `focus.recommended_next_actions` (`Action[]`)

## 5) Issues (`Issue`)

Each issue is a rule finding.

- `id` (string): stable rule identifier (e.g. `missing_canonical`)
- `category` (string): e.g. `seo`, `security`, `schema`, `content`, `internal_links`
- `severity`: `error` | `warning` | `notice`
- `rank` (number 1–10): rule importance within severity
- `title` (string): short label
- `description` (string): what was detected and why it matters
- `affected_urls` (string[]): normalized URLs
- `recommendation` (string): deterministic action guidance
- `tags` (string[]): `focus`, `inlink`, `global` (and optional future tags)

### Evidence (`Evidence[]`)

Evidence is the only allowed way to justify findings. It must be concrete.

- `type`: `page` | `link` | `http` | `content` | `schema` | `security` | `other`
- `message`: compact human-readable claim
- Optional fields for traceability:
  - `url`, `source_url`, `target_url`
  - `anchor_text`
  - `status`
  - `details` (Record<string, unknown>) — small structured payload (counts, sample lists, metric values)

## 6) Page summary (`PageSummary`)

A compact list used for navigation and basic reporting:

- `url`, `final_url` (string)
- `status` (number)
- `title` (string | null)
- `canonical` (string | null)

Full extraction data lives in `pages.json`.

## 7) LLM outputs (optional)

### Proposed fixes (`ProposedFix`)
- `issue_id` (string): which issue it addresses
- `page_url` (string): target URL
- `proposal` (string): text-only proposal (e.g. suggested title variants, outline, internal-link plan)
- `rationale` (string): evidence-based justification

### Actions (`Action`)
- `title` (string)
- `impact`: `high` | `medium` | `low`
- `effort`: `high` | `medium` | `low`
- `rationale` (string)
- `issue_ids` (`string[]`, optional): referenced issue types (rule ids), e.g. `excessive_nav_only_inlinks`

## 8) Planned extensions (not guaranteed by the current schema)

These may be added later as the audit expands:
- richer `ProposedFix` structure (SERP pack / outline pack / internal link plan / entity-local pack)
- performance metrics (Lighthouse: LCP/INP/CLS) stored per page
- internal link graph summaries
- content similarity/cannibalization diagnostics

When added, they must preserve backward compatibility of `report.json` consumers.
