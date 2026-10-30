#!/usr/bin/env bash
# One command to start AI Office: checks the basics, creates your private config on first run, opens the browser.
# Usage: ./start.sh
set -u
cd "$(dirname "$0")" || exit 1

say() { printf '%s\n' "$*"; }
need() { say "✗ $1"; exit 1; }

command -v python3 >/dev/null || need "Python 3.10 or newer is required (https://www.python.org/downloads/)."
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || need "Python 3.10 or newer is required; you have $(python3 -V 2>&1)."
say "✓ Python $(python3 -c 'import platform; print(platform.python_version())')"

command -v tmux >/dev/null || need "tmux is required to run agents (macOS: brew install tmux)."
say "✓ tmux"

has_claude=0; has_opencode=0
command -v claude >/dev/null && { has_claude=1; say "✓ Claude Code found"; }
{ command -v opencode >/dev/null || [ -x "$HOME/.opencode/bin/opencode" ]; } && { has_opencode=1; say "✓ OpenCode found"; }
[ "$has_claude" = 0 ] && [ "$has_opencode" = 0 ] && need "Install Claude Code (https://docs.claude.com/en/docs/claude-code) or OpenCode (https://opencode.ai) first: the agents run on one of them."

if [ ! -f agents.json ]; then
  cp agents.example.json agents.json
  say "• Created agents.json from the example. It is private (git ignores it)."
  say "  Next: open Settings → Agents, point each agent at a real project folder, and pick its runtime and model."
fi

if [ "$has_opencode" = 1 ]; then
  python3 scripts/setup-opencode-agents.py >/dev/null 2>&1 && say "✓ OpenCode tool limits installed" || say "! Could not install the OpenCode tool limits; run: python3 scripts/setup-opencode-agents.py"
fi

if [ -f port ] && curl -sf "http://127.0.0.1:$(cat port)/api/agents" >/dev/null 2>&1; then
  say "✓ AI Office is already running"
else
  rm -f port
  python3 server.py >server.log 2>&1 &
  for _ in $(seq 1 30); do [ -f port ] && break; sleep 0.3; done
  [ -f port ] || { tail -5 server.log; need "The server did not start; see server.log."; }
fi
url="http://127.0.0.1:$(cat port)"
say "✓ AI Office is running: $url"
say "  Check everything in Settings → Health. Stop it with: kill \$(lsof -ti :$(cat port))"
( command -v open >/dev/null && open "$url" ) || ( command -v xdg-open >/dev/null && xdg-open "$url" ) || true
