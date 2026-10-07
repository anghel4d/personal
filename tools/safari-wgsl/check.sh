#!/bin/bash
# Compiles every WGSL module in a capture (../shader-cost/capture.js) with Safari's compiler, as Safari does for the
# page, and prints one line per module. Exits non-zero if any module fails.
# Usage: check.sh <capture.json> [Apple GPU family: 8 (iPhone 15, A16, the default) or 9 (A17 Pro and later)]
# WGSLC_REPORT names the driver (default build/bin/wgslc-report here); OUT keeps the full reports (default: a temp dir).
set -u
CAP=$1; FAM=${2:-8}
BIN=${WGSLC_REPORT:-$(cd "$(dirname "$0")" && pwd)/build/bin/wgslc-report}
OUT=${OUT:-$(mktemp -d)}
mkdir -p "$OUT"
python3 -I - "$CAP" "$OUT" <<'PY'
import json, os, sys
cap, out = sys.argv[1], sys.argv[2]
for i, m in enumerate(json.load(open(cap))['mods']):
    open(os.path.join(out, '%02d-%s.wgsl' % (i, (m.get('label') or 'module').replace(' ', '_'))), 'w').write(m['code'])
PY
fail=0
for f in "$OUT"/*.wgsl; do
  r=${f%.wgsl}.report.txt
  "$BIN" --apple-gpu-family="$FAM" "$f" > "$r" 2>&1; rc=$?
  printf '%-16s %-6s %s warning(s)\n' "$(basename "$f" .wgsl)" "$([ $rc = 0 ] && echo OK || echo FAILED)" "$(grep -c '^warning' "$r")"
  if [ $rc != 0 ]; then fail=1; grep -A2 '^error' "$r" | sed 's/^/    /'; fi
done
echo "reports in $OUT"
exit $fail
