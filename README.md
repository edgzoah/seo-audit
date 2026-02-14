# SEO Audit (Next.js + CLI Backend)

Local CLI tool for deterministic SEO audits (crawl + extract + rule engine + scoring), with optional LLM proposals via Codex CLI or API providers (GPT/OpenAI, Gemini, Claude).

## Requirements

- Node.js 20+
- npm
- Optional for AI: `codex` CLI (`codex exec --help` should work, and you should be logged in)

## Install

```bash
npm install
npm run build
```

## Next.js App (current default)

Run web app:

```bash
npm run dev
```

Open:

- `http://localhost:3000/` - list of runs from `runs/`
- `http://localhost:3000/runs/<run-id>` - run details
- `http://localhost:3000/api/runs` - API list
- `http://localhost:3000/api/runs/<run-id>` - API report JSON

Current setup keeps backend/domain logic in `src/` and uses Next.js `app/` as UI/API layer.

## CLI (legacy/compatible mode)

Build CLI TypeScript output:

```bash
npm run build:cli
```

## Quick Start

Initialize config/docs (once):

```bash
npm run build:cli
node dist/cli.js init
```

Run an audit:

```bash
node dist/cli.js audit https://example.com -C surface --depth 2 --format md
```

Generate report from an existing run:

```bash
node dist/cli.js report <run-id> --format json
node dist/cli.js report <run-id> --format md
node dist/cli.js report <run-id> --format llm
```

Compare two runs:

```bash
node dist/cli.js diff <baseline-run-id> <current-run-id> --format md
```

## Audit Options

```text
-C, --coverage quick|surface|full
-m, --max-pages <n>
--depth <n>
--format json|md|llm
--refresh
--headless
--no-robots
--llm
--baseline <run-id>
--brief <path-to-brief.md>
--focus-url <url-or-path>
--focus-keyword "<keyword>"
--focus-goal "<goal>"
--constraints "c1;c2;c3"
```

## Run Artifacts

Each run writes to `runs/<run-id>/`:

- `inputs.json`
- `brief.md`
- `seed-discovery.json`
- `crawl.jsonl`
- `pages.json`
- `issues.json`
- `report.json`
- `report.md`
- `report.llm.txt`
- `diff.json` and `diff.llm.txt` (when `--baseline` is provided)
- `llm.*` files (when `--llm` is enabled)

### Crawl Identity and Link Deduplication

- In `surface` mode, crawl identity keeps only pagination query params: `page`, `p`, `paged`.
- Non-pagination query params (for example UTM tracking params) are ignored for surface deduplication.
- Internal outlinks in `pages.json` are deduplicated per `(targetUrl, anchorText, rel, isNavLikely)` and include `occurrences`.
- Internal inlink graph metrics count unique source->target relations (not repeated menu/footer duplicates).

## Baseline / Regression

`baseline` is your reference run. Use it to detect regressions (score drop, new issues, worsened issues):

```bash
node dist/cli.js audit https://example.com --baseline <old-run-id>
```

This creates diff artifacts in the new run directory.

## Optional AI (`--llm`)

When `--llm` is enabled:

- audit calls configured provider:
  - `codex` (default fallback)
  - `openai` / `gpt`
  - `gemini`
  - `claude` / `anthropic`
- proposals are added to `report.json`:
  - `proposed_fixes`
  - `prioritized_actions`

If LLM provider fails, deterministic audit still succeeds and LLM section is skipped.

### Provider Configuration

Select provider:

```bash
SEO_AUDIT_LLM_PROVIDER=codex|openai|gemini|claude
```

Prompt profile (cost/quality tradeoff):

```bash
SEO_AUDIT_LLM_PROMPT_PROFILE=cheap|quality
```

Default: `cheap`.

API keys:

```bash
OPENAI_API_KEY=...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Optional model overrides:

```bash
SEO_AUDIT_OPENAI_MODEL=gpt-4o-mini
SEO_AUDIT_GEMINI_MODEL=gemini-2.0-flash
SEO_AUDIT_CLAUDE_MODEL=claude-3-5-sonnet-latest
```

If provider is not explicitly set, tool auto-selects in this order:
1. `openai` (when `OPENAI_API_KEY` exists)
2. `gemini` (when `GEMINI_API_KEY` exists)
3. `claude` (when `ANTHROPIC_API_KEY` exists)
4. `codex`

## LLM Troubleshooting

- Check selected provider credentials and network access.
- For Codex:
  - `codex --help`
  - `codex exec --help`
- Check run logs:
  - `runs/<run-id>/llm.error.log`
  - `runs/<run-id>/llm.raw.txt` (if JSON repair path was used)
- For Codex, you can override command binary with:
  - `SEO_AUDIT_CODEX_CMD=codex`

## Notes

- Core audit is deterministic for the same inputs/environment.
- LLM input payload is compacted to reduce token usage/cost.
