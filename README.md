<p align="center">
  <img src="docs/hero.webp" alt="MyOffice — a local 3D office for AI agents" width="100%">
</p>

<h1 align="center">MyOffice</h1>

<p align="center">
  <b>A local-first 3D office for your AI agents.</b><br>
  Watch Claude Code, OpenCode, Codex, Gemini and any CLI wake up at a desk, do the work,<br>
  and hand you a result to approve.
</p>

<p align="center">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="Local-first" src="https://img.shields.io/badge/local--first-127.0.0.1-0f766e">
  <img alt="Agents" src="https://img.shields.io/badge/agents-Claude%20%7C%20OpenCode%20%7C%20Codex%20%7C%20Gemini-6d28d9">
  <img alt="Tests" src="https://img.shields.io/badge/tests-59%20passing-16a34a">
  <img alt="License" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial-d97706">
  <a href="https://halilbaris.github.io/AI-Office/?demo=1"><img alt="Live demo" src="https://img.shields.io/badge/demo-live-ff6b4a"></a>
</p>

<p align="center">
  <a href="https://halilbaris.github.io/AI-Office/?demo=1"><b>Live demo</b></a> ·
  <a href="#install"><b>Install</b></a> ·
  <a href="#bring-any-agent"><b>Bring any agent</b></a> ·
  <a href="#how-it-works"><b>How it works</b></a> ·
  <a href="#origin"><b>Origin</b></a>
</p>

![MyOffice in light mode — eight rooms, live terminals and the activity dock](docs/office.png)

![The same office in dark mode](docs/office-dark.png)

## Why MyOffice

Agent tools are powerful, but they are invisible: a terminal scrolls, a session ends, and you have no idea what
happened. MyOffice turns that work into a room you can watch.

Each helper is a procedurally modelled animal at a desk. It wakes when work arrives, shows its current action on
its screen, drops a result into **Needs you**, and goes back to sleep. **Idle costs zero tokens.**

## Highlights

| | |
|---|---|
| **A real office, not a dashboard** | Isometric 3D rooms, animals at desks, clickable agents, a live event stream, a bottom activity dock and a daily token counter. |
| **Human in the loop** | Every result lands in **Needs you** with **Full result**, **Approve** and **Later**. Nothing is published, sent or paid for on its own. |
| **Any agent** | Claude Code is automatic; OpenCode is read from its local database; Codex, Gemini and any other CLI plug in through `myoffice run`, a hook or a JSONL watcher. |
| **Local by default** | The server binds `127.0.0.1`. It reads local session files; prompts, model output and file contents are never uploaded. |
| **Small and dependency-free** | Python standard library + a single-page three.js frontend. No database server, no cloud account. |
| **Built for a team** | A CEO routes work to specialists (SOC Analyst, Lab Builder, Content Writer…) and a second helper reviews the result. |
| **Made to be watched** | Light and dark themes, sound with a mute toggle, focus mode, room and agent panels, and a click-anywhere overview. |

## A look inside

<table>
<tr>
<td width="50%"><a href="docs/settings.webp"><img src="docs/settings.webp" alt="Settings: name, brand, greeting and limits"></a><br><sub><b>Settings</b> — name, brand, greeting and the daily token limit.</sub></td>
<td width="50%"><a href="docs/memory.webp"><img src="docs/memory.webp" alt="Memory: what each agent has learned"></a><br><sub><b>Memory</b> — what every agent has learned, in plain markdown.</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/history.webp"><img src="docs/history.webp" alt="History: every CEO exchange and run"></a><br><sub><b>History</b> — every CEO exchange, run and review, with the full result.</sub></td>
<td width="50%"><a href="docs/plan.webp"><img src="docs/plan.webp" alt="Plan: schedules, goals and queued work"></a><br><sub><b>Plan</b> — schedules, goals, projects and work waiting its turn.</sub></td>
</tr>
</table>

Click any image to open it full size.

## Install

**Try it without installing:** [open the live demo](https://halilbaris.github.io/AI-Office/?demo=1) — fake
agents, no backend and no model calls.

macOS or Linux (Windows via WSL2):

```bash
curl -fsSL https://raw.githubusercontent.com/halilbaris/AI-Office/main/install.sh | bash
```

This clones into `~/MyOffice`, creates the private `agents.json` and `bridge.json`, and puts the `myoffice`
launcher in `~/.local/bin`.

```bash
myoffice start
```

**Manual checkout**

```bash
git clone https://github.com/halilbaris/AI-Office.git
cd AI-Office
./start.sh
```

**Requirements:** Python 3.10+, git, and one of [Claude Code](https://docs.claude.com/en/docs/claude-code) or
[OpenCode](https://opencode.ai) for the office's own agents. `tmux` is needed to give work from the office;
watching your own sessions works without it.

### Try the demo, no setup

```bash
cd frontend && python3 -m http.server 8000
# open http://127.0.0.1:8000/?demo=1
```

The demo uses `frontend/demo-data.json`: fake agents wake up, work and finish without a backend or any model
calls. `?auto=0` turns automatic runs off and `?light=1` renders at lower resolution.

![The demo mode, no backend](docs/myoffice.png)

## Bring any agent

Three ways in, all on the same local event stream:

**1. Wrapper — works with any CLI**

```bash
myoffice run -- codex exec "fix the failing test"
myoffice run -- gemini -p "summarize this repo"
myoffice run --agent writer -- ./my-agent
```

The wrapper tees the output to your terminal and sends only tool names and short targets to the office. It never
changes the command's arguments or working directory.

**2. Hook — for tools that can call a command**

```bash
myoffice hook --agent writer --tool read --target README.md
```

**3. Passive logs — for tools that already write JSONL**

```bash
cp watch.json.example watch.json
# list the Codex, Gemini or other session folders you want to watch
```

OpenCode is detected automatically from `~/.local/share/opencode/opencode.db` (v1 and v2 schemas). Claude Code is
read through the built-in bridge (`~/.claude/sessions` + transcripts).

Every session carries its **source** (`claude`, `opencode`, `wrapper`, `hook`, `log`), so the UI can show where
it came from.

## How it works

```mermaid
flowchart LR
  B["Browser · 3D office"] <-->|JSON + SSE| S["server.py · 127.0.0.1"]
  S --> R["runner.py"] --> T["tmux"] --> C["Claude Code / OpenCode"]
  C -->|progress| S
  S --> BR["bridge.py · read-only"] --> CL["~/.claude"]
  S --> P["providers/ · read-only"] --> OC["OpenCode DB · JSONL logs"]
  X["myoffice run / hook"] -->|POST /api/ingest| S
```

- **Frontend** — a procedural three.js office (no photos or model files), a live event stream, the activity dock,
  room and agent panels, sound, light/dark and the demo mode.
- **Backend** — Python standard library, bound to `127.0.0.1`. `runner.py` starts agents in tmux windows;
  `bridge.py` watches your own Claude Code sessions; `providers/` watches OpenCode and configured JSONL logs.
- **Events** — `events.jsonl` is the single log. The browser replays it over SSE and the terminal list is merged
  from every source.

## Privacy and safety

- The server is local: `127.0.0.1` only.
- The bridge and providers are **read-only** against agent tools.
- Only a **tool name and a short target** are stored. A shell command is reduced to its first word; prompts,
  model output and file contents are never written.
- Sessions are mapped to office agents through `bridge.json` (`cwd` → agent, `default` fallback).
- Nothing is published, emailed, paid for, or pushed by the office. The last step is always yours.

## Configuration

| File | Purpose |
|---|---|
| `agents.json` | Your private team: cwd, model, tools and preset tasks. Created from `agents.example.json`. |
| `bridge.json` | Maps a working directory to an office agent. Created on first run; edit it to match your folders. |
| `watch.json` | Optional passive JSONL watchers. Copy `watch.json.example`. |
| `events.jsonl`, `state/`, `runs/`, `output/`, `memory/` | Local working data (gitignored). |

Agents, models and folders are also editable in **Settings → Agents**. **Settings → Health** explains anything
missing in plain words.

## Development

```bash
./scripts/check.sh
```

Runs Python syntax, the unit tests (59), JSON and frontend checks, the leftover-Turkish rule and an API smoke test
on port 8798.

- Python standard library only; no new runtime dependencies.
- Add tests under `tests/` for parsers, mapping and ingestion changes.
- See [CONTRIBUTING.md](CONTRIBUTING.md).

## Origin

MyOffice was originally taken from and is developed on top of
[selmakcby/ajan-ofisi](https://github.com/selmakcby/ajan-ofisi). The original project provided the 3D office, the
CEO flow and the agent runner. This fork adds the universal agent ingestion layer, the bottom activity dock, the
installable CLI, the sound and overview controls, and this documentation.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — personal, noncommercial use. The original project's copyright and license
remain with its authors; see the upstream repository.
