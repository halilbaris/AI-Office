#!/usr/bin/env bash
# Quick health check for MyOffice: syntax, JSON, leftover Turkish text and a live API smoke test.
# Usage: ./scripts/check.sh            (checks files and boots a throwaway server on 8798)
set -u
export LC_ALL=en_US.UTF-8   # the Turkish-text check needs a UTF-8 locale
cd "$(dirname "$0")/.." || exit 1
fail=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"; [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null; true' EXIT

echo "== python syntax"
python3 -m py_compile server.py runner.py bridge.py common.py token_counter.py verify.py || fail=1

echo "== unit tests"
python3 -m unittest discover -s tests >"$tmp/unit.log" 2>&1 || { tail -15 "$tmp/unit.log"; fail=1; }
tail -3 "$tmp/unit.log"

echo "== json"
for f in agents.json agents.example.json bridge.json bridge.example.json frontend/demo-data.json; do
  [ -f "$f" ] && { python3 -m json.tool "$f" >/dev/null || { echo "broken: $f"; fail=1; }; }
done

echo "== frontend module syntax"
for f in frontend/*.js; do
  cp "$f" "$tmp/$(basename "${f%.js}").mjs"
  node --check "$tmp/$(basename "${f%.js}").mjs" >/dev/null 2>&1 || { echo "broken: $f"; fail=1; }
done

echo "== leftover turkish (LICENSE excluded)"
if grep -rn --include='*.py' --include='*.js' --include='*.html' --include='*.json' --include='*.md' \
     -e '[çğıöşüÇĞİÖŞÜ]' . 2>/dev/null | grep -v '^./LICENSE' | grep -v '^./.git/' \
     | grep -v '^./agents.json' | grep -v '^./bridge.json' \
     | grep -v '^./output/' | grep -v '^./runs/' | grep -v '^./state/' | grep -v '^./memory/'; then
  echo "^^ Turkish characters above"; fail=1
else
  echo "clean"
fi

echo "== api smoke test (port 8798)"
OFFICE_PORT=8798 python3 server.py >"$tmp/server.log" 2>&1 &
pid=$!
for _ in $(seq 1 20); do sleep 0.3; curl -sf "http://127.0.0.1:8798/api/agents" >/dev/null && break; done
for p in agents counter tokens memory terminals settings history health; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8798/api/$p")
  [ "$code" = "200" ] || { echo "GET /api/$p -> $code"; fail=1; }
done
curl -s -o /dev/null -w 'index -> %{http_code}\n' "http://127.0.0.1:8798/" | grep -q '200' || fail=1
grep -q Traceback "$tmp/server.log" && { echo "server traceback:"; tail -5 "$tmp/server.log"; fail=1; }

echo
[ "$fail" = "0" ] && echo "OK" || echo "FAILED"
exit "$fail"
