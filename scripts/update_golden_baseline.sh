#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$ROOT/tests/golden/reports"

"$ROOT/scripts/update_golden_output.sh" --png-only

(
  cd "$ROOT/tools/golden_compare"
  node generate_reference.mjs
)

mkdir -p "$REPORT_DIR"
python3 "$ROOT/tools/golden_compare/compare_golden.py" \
  --json-out "$REPORT_DIR/main.json" \
  --csv-out "$REPORT_DIR/main.csv" \
  --fail-on-missing \
  --min-coverage 1.0
