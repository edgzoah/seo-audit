# SEO Audit CLI

Local CLI tool for deterministic SEO audits (crawl + extract + rule engine + scoring), with optional LLM proposals via Codex CLI.

## Requirements

- Node.js 20+
- npm
- Optional for AI: `codex` CLI (`codex exec --help` should work, and you should be logged in)

## Install

```bash
npm install
npm run build
```

## Quick Start

Initialize config/docs (once):

```bash
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

## Baseline / Regression

`baseline` is your reference run. Use it to detect regressions (score drop, new issues, worsened issues):

```bash
node dist/cli.js audit https://example.com --baseline <old-run-id>
```

This creates diff artifacts in the new run directory.

## Optional AI (`--llm`)

When `--llm` is enabled:

- audit calls Codex CLI in non-interactive mode (`codex exec`)
- proposals are added to `report.json`:
  - `proposed_fixes`
  - `prioritized_actions`

If Codex fails, deterministic audit still succeeds and LLM section is skipped.

## LLM Troubleshooting

- Check Codex CLI:
  - `codex --help`
  - `codex exec --help`
- Ensure login/auth is configured for Codex CLI.
- Check run logs:
  - `runs/<run-id>/llm.error.log`
  - `runs/<run-id>/llm.raw.txt` (if JSON repair path was used)
- You can override command binary with:
  - `SEO_AUDIT_CODEX_CMD=codex`

## Notes

- Core audit is deterministic for the same inputs/environment.
- LLM input payload is compacted to reduce token usage/cost.
