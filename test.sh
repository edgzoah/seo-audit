#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Uzycie: $0 <domena-lub-url>"
  echo "Przyklad: $0 domena.pl"
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

TARGET_INPUT="$1"
if [[ "$TARGET_INPUT" =~ ^https?:// ]]; then
  TARGET_URL="$TARGET_INPUT"
else
  TARGET_URL="https://$TARGET_INPUT"
fi

if [[ ! -f "package.json" ]]; then
  echo "Uruchom skrypt z katalogu repo (tam gdzie jest package.json)."
  exit 1
fi

mkdir -p runs

BEFORE_LATEST_RUN="$(ls -1 runs 2>/dev/null | sort | tail -n 1 || true)"
BRIEF_FILE="$(mktemp)"

cleanup() {
  rm -f "$BRIEF_FILE"
}
trap cleanup EXIT

cat >"$BRIEF_FILE" <<'EOF'
focus on: /test-focus-url
primary keyword: test keyword
goal: top10
EOF

echo "==> [1/5] Build (npm run build)"
npm run build

echo "==> [2/5] Audit smoke test: $TARGET_URL"
set +e
node dist/cli.js audit "$TARGET_URL" --brief "$BRIEF_FILE" --format llm --no-robots --headless
AUDIT_EXIT_CODE=$?
set -e

AFTER_LATEST_RUN="$(ls -1 runs 2>/dev/null | sort | tail -n 1 || true)"
if [[ -z "$AFTER_LATEST_RUN" || "$AFTER_LATEST_RUN" == "$BEFORE_LATEST_RUN" ]]; then
  echo "BLAD: Nie wykryto nowego runa w katalogu runs/."
  exit 1
fi

RUN_DIR="runs/$AFTER_LATEST_RUN"
INPUTS_FILE="$RUN_DIR/inputs.json"
BRIEF_OUT_FILE="$RUN_DIR/brief.md"

echo "==> [3/5] Weryfikacja artefaktow runa: $RUN_DIR"
if [[ ! -f "$INPUTS_FILE" ]]; then
  echo "BLAD: Brak pliku $INPUTS_FILE"
  exit 1
fi

if [[ ! -f "$BRIEF_OUT_FILE" ]]; then
  echo "BLAD: Brak pliku $BRIEF_OUT_FILE"
  exit 1
fi

echo "==> [4/5] Podsumowanie inputs.json"
node -e '
const fs = require("node:fs");
const p = process.argv[1];
const data = JSON.parse(fs.readFileSync(p, "utf-8"));
console.log("target:", data.target);
console.log("coverage:", data.coverage);
console.log("report_format:", data.report_format);
console.log("respect_robots:", data.respect_robots);
console.log("rendering_mode:", data.rendering_mode);
console.log("focus.primary_url:", data.brief?.focus?.primary_url ?? null);
console.log("brief.text.length:", (data.brief?.text ?? "").length);
' "$INPUTS_FILE"

echo "==> [5/5] Smoke test komendy diff (jesli jest report.json)"
REPORT_RUN_ID="$(for d in runs/*; do [[ -f "$d/report.json" ]] && basename "$d"; done | sort | tail -n 1 || true)"
if [[ -n "$REPORT_RUN_ID" ]]; then
  node dist/cli.js diff "$REPORT_RUN_ID" "$REPORT_RUN_ID" --format md | sed -n '1,12p'
else
  echo "POMINIETO: brak runa z report.json do testu diff."
fi

echo ""
echo "Run ID: $AFTER_LATEST_RUN"
if [[ $AUDIT_EXIT_CODE -ne 0 ]]; then
  echo "UWAGA: audit zwrocil kod $AUDIT_EXIT_CODE (najczesciej brak sieci), ale artefakty Step 0 zostaly zweryfikowane."
else
  echo "OK: audit zakonczyl sie sukcesem."
fi
