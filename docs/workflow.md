# Workflow

1. `seo-audit init`
2. `seo-audit audit <url>`
3. `seo-audit report <run-id> --format md|json|llm`

Troubleshooting LLM:
- `--llm` uses `codex exec` in non-interactive mode.
- Ensure `codex exec --help` works and auth is configured.
