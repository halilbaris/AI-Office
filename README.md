# MyOffice

A local 3D office for Claude Code agents. Each agent is a procedurally modelled animal at a desk: it wakes
up when work arrives, shows what it is doing on its screen, drops its output into a review card and goes back
to sleep. Nothing runs while idle: **0 tokens**.

![MyOffice](docs/cover.jpg)

- **Frontend:** a procedural 3D office built with three.js (no photos, no model files), clickable agents,
  room and agent panels, a live event stream, a token counter, small Web Audio sounds and a demo mode.
- **Backend:** Python standard library only, bound to `127.0.0.1`. It runs agents through `claude -p`.
- **Requirements:** Python 3.10+, [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude` command)
  and `tmux` (only needed to give work from the office; watching your own sessions works without tmux).
- **License:** PolyForm Noncommercial 1.0.0 — personal, noncommercial use only. See `LICENSE`.

## Quick try (nothing connected)

```bash
cd frontend && python3 -m http.server 8000
# open: http://127.0.0.1:8000/?demo=1
```

`?demo=1` makes no backend requests: the sample agents in `frontend/demo-data.json` pick up and finish work on
their own. Typing something in the bottom box makes the fake CEO hand it to a matching agent. `?auto=0` turns
automatic runs off, `?light=1` renders at lower resolution with a small shadow. (The frontend uses ES modules,
so opening the file directly with `file://` does not work; the plain server above is enough.)

## Connecting your own agents

1. **Copy the configuration.**

```bash
cp agents.example.json agents.json
cp bridge.example.json bridge.json      # optional: terminal bridge mapping
```

`agents.json` and `bridge.json` are gitignored, so your paths and prompts never enter the repository.

2. **Write `cwd` and your agents.** Point every agent's `cwd` at a real project folder (`~` works), keep
   `allowed_tools` as narrow as possible, and give it only the preset tasks you actually want. An agent whose
   folder is missing counts as "not installed" and is never run.

3. **Start the server.**

```bash
python3 server.py            # http://127.0.0.1:8796, next free port when busy (written to ./port)
tmux attach -t office        # watch running agents live (one window per run)
```

4. **Open `http://127.0.0.1:8796`.** Click an agent to give it a preset task, or use the bottom box to tell the
   CEO what you need.

Health check: `./scripts/check.sh` compiles the Python, validates the JSON, syntax-checks the frontend modules,
looks for leftover Turkish text and boots a throwaway server on port 8798 to hit every endpoint.

### The default team

The shipped roster is deliberately small: one desk per kind of work.

| Agent | Room | Can do |
|---|---|---|
| CEO | center | assigns work, no tools, no file access |
| Analyst | Security Operations | reads code and recent changes, reports risks with `file:line` |
| Engineer | Code Room | builds and fixes product code and UI, `typecheck`/`lint` clean |
| Writer | Writing Room | drafts courses, blogs and reports, a source per claim |

Add an agent by appending an entry to `agents.json`. Rooms are derived from the agents: whatever `room` an agent
has is the room it sits in; the CEO room is always in the middle. One agent or thirty both fit the frame.

### Rooms

- **Any number of rooms.** A room id that appears in `agents.json` is opened automatically. `soc` → "Security
  Operations" style names are derived from the id; write the room into the `rooms` list to set `name`,
  `description` and `note` yourself, and the order there sets the order on the scene.
- **Built-in themes:** `ceo`, `writing`, `code`, `design`, `social`, `research`, `end-of-day`, `workshop`,
  `maintenance`, `mail`, `data`. These ids bring their own colour and furniture (shelf, inspiration board,
  server racks…).
- **Desks arrange themselves.** A room widens with its agent count; beyond four desks they form two rows. To
  place a desk by hand, add `"position": {"x": 1.2, "z": 1.2, "stand": true}` to the agent (`x` relative to the
  room centre, `z` depth, `stand` for a raised monitor).

## Architecture

```
browser (frontend/)  ──GET/POST──▶  server.py (127.0.0.1)  ──tmux new-window──▶  runner.py  ──stdin──▶  claude -p
       ▲                                  │   ▲                                    │
       └──────── SSE: events ─────────────┘   └──── events.jsonl ◀── progress, usage, finish ┘
                                          bridge.py (read-only) ◀── ~/.claude/sessions + transcripts
```

### CEO = the main configuration

This folder is the CEO. Project folders are **never moved**; `agents.json` holds each agent's `cwd`, model,
allowed/denied tools and preset tasks. The CEO is a single tool-less `claude -p --json-schema` call: it reads the
request and returns `{"answer": "...", "assignments": [{"agent", "prompt"}]}`. The server validates the JSON
(unknown agent, missing folder, empty/oversized prompt, at most 5 assignments); if it is broken **no run starts**.
An agent with a `trigger_word` (e.g. `mail`) can only be assigned when that word appears in the request.

### One agent = one project folder

An agent runs in its own `cwd` and sits in the room named by its `room` field. The CEO sits in the middle; the
other rooms are laid out around it, and the plinth, lights and camera are computed from that layout.

### Office run: wakes on work, 0 tokens when idle

A button (`POST /api/task`) or the CEO starts a run: the server writes the arguments to `runs/<id>.arg.json` and
opens a new window in the tmux session `office` running `runner.py`. The runner:

- reads the agent config from `agents.json` (never from the argument file);
- embeds `memory/<agent>.md` into the task template and feeds the prompt to `claude -p` on **stdin**;
- writes stream-json to `runs/<id>.log` and drops progress events into `events.jsonl`;
- stores the result in `output/<agent>/<id>.md` and appends the `<memory_add>` block to memory as a dated entry.

The server streams `events.jsonl` to the frontend over SSE. No timer, loop or heartbeat ever calls a model, so an
idle office costs nothing. An agent with `"lean": true` runs without the global CLAUDE.md/rules/MCP, which cuts
context and tokens for small, frequent jobs.

### Terminal bridge: the sessions you opened yourself

`bridge.py` is a 2-second thread in the server and **read-only**: `~/.claude/sessions/<pid>.json` for live
sessions and `~/.claude/projects/<cwd>/<session>.jsonl` for the transcript, tailed by offset so only new lines are
read. **Every session you open shows up in the office**, even without `bridge.json`; that file only decides which
session appears on which agent. Order: `window` (tmux window name) > `cwd` (the folder itself or any parent) >
`default`. Without `default` an unmapped session lands on the first agent; `""` hides unmapped sessions. Sessions
carrying any string from `hide` are never shown. The office's own `claude -p` runs and other non-interactive runs
never fall back to the default.

**Clicking an agent** (or its kitten) opens a "Now" section in the panel: every session bound to that agent, what
it is doing and its subagents (task title, type, model, last tool; last 30 minutes). Subagent data comes from
`<session>/subagents/agent-*.meta.json` plus the transcript tail; message text is never read.

Scope: plain terminal, VS Code / IDE terminal and tmux (`~/.claude/sessions`); the Claude desktop app and other
non-terminal entrypoints (transcript scan).

**My session shows on the wrong agent / not at all:** check the server log. Every unmapped session gets one
`bridge: session not mapped to any agent (cwd=…, tmux window=…)` line with the mapping to add. tmux names an
unnamed window `claude`; if you map by `window`, name the window (`Ctrl-b ,`) or switch to a `cwd` mapping.

Only the **tool name + short target** (file name, search pattern, tool description, first word of a Bash command,
skipping `FOO=bar` assignments), the "got a new task" flag and **usage** numbers reach the event stream. **Message
text, prompts and file contents are never read, stored or logged.** The bridge does not touch Claude Code settings
or hooks.

### Token counter

`token_counter.py` keeps per-agent daily tokens in `state/token-<date>.json`; office runs and terminal sessions are
counted separately, deduplicated by `message.id` (the same message is never counted twice), and records are
replaced rather than appended. Four fields are shown: input, output, cache write and **cache read**. Cache-read
tokens are context re-read every turn (CLAUDE.md, previous messages), not new work, and are billed far cheaper,
but they are usually the biggest number. The cost tab only sums the `total_cost_usd` reported by `claude -p` (API
list price equivalent; not the amount billed on a subscription).

### Models

Every agent runs its own `claude -p --model <model>`; the model lives in `agents.json` per agent (and in
`ceo.model`). The office never picks a model on its own and never calls one while idle. If your Claude Code is
routed through a proxy that maps model aliases, the alias in `agents.json` is what the proxy sees — check that
mapping before expecting `sonnet` and `haiku` to behave differently.

### Settings tab

The **Settings** tab edits the office without touching the file by hand:

- **General** — your name (greeting), brand, a custom greeting line, one line under the welcome summary, and
  whether that summary mentions today's token total and your open terminal sessions.
- **Agents** — name, room, model (alias or full model id) and `lean` per agent. Moving an agent to another room
  moves its desk; the layout is recomputed.
- **Rooms** — display name, description and scene order, plus adding a room or removing an empty one. Room ids are
  permanent because agents reference them, and a room holding agents cannot be removed.

New agents are added from the same tab: id, name, room, folder, model, runtime and a **permission profile**
(`read`, `review`, `build`, `research`, `deploy`). The profile is the only way to grant tools from the browser; an
arbitrary tool list still has to be written into `agents.json` by hand. `deploy` is the only profile that lifts a
global denial: it allows `git push` (and the project's `deploy*.sh`) for that one agent via `denials_override`.
Everything else — publishing, mail, payments — stays forbidden. Adding a room or removing an empty one saves
immediately, and the page reloads so the scene picks the change up.

Every save is written to `agents.json` atomically under a lock, after copying the previous file to
`agents.json.bak`. Rooms only appear on the scene once an agent sits in them; the Rooms tab lists the empty ones
too. `cwd` and tool permissions are deliberately **not** freely editable from the browser: they are the security
boundary and stay a file-level decision outside the profiles above.

### Runtime: Claude Code or OpenCode

An agent runs on `claude -p` by default. Set `"runtime": "opencode"` (or pick it when adding an agent) to run the
same task through the OpenCode CLI instead:

```
opencode run --model <provider>/<model> "<prompt>"
```

The prompt still goes in as one argv element, never through a shell. OpenCode runs are plain text: there are no
per-tool events and no usage numbers, so their tokens do not show up in the counter — only the output file and the
finish event. Everything else (tmux window, output file, memory block, event stream) works the same.

## API

| Endpoint | What |
| --- | --- |
| `GET /api/agents` | agents + `installed`, `status`, `last_run`, `rooms`, `settings` (cwd and task prompts are not sent) |
| `POST /api/task` | `{"agent": id, "label": "<preset task>"}` or `{"agent": id, "prompt": "..."}` → 202; 409 when busy |
| `POST /api/ceo` | `{"text": "...", "dry": false}` → `{answer, assignments, started, rejected}`; `dry: true` plans only |
| `GET /api/events?last=N` | SSE; replays the last N events, then streams live |
| `GET /api/terminals` | sessions from the bridge (agent, room, session name, status, last tool, last target, subagents) |
| `GET /api/tokens` | today's tokens per agent |
| `GET /api/counter` | today's run count, active agents, per-run duration/usage/cost |
| `GET /api/memory` | entry count and the last 3 entries of every `memory/<agent>.md` |
| `GET /api/settings` | greeting/brand card options, rooms and per-agent name/room/model/lean |
| `POST /api/settings` | same shape, saved into `agents.json` (atomic, `.bak` backup, validated) |

## Security notes

- **`127.0.0.1` only.** `Host` and `Origin` headers are accepted only for localhost/127.0.0.1 (defence against
  DNS rebinding and requests from other sites). Do not expose the server on `0.0.0.0` or publish it.
- **The prompt never becomes a shell string.** Commands are built as argument lists and the prompt goes to
  `claude` on stdin. Agent ids are whitelist-matched (`^[a-z0-9-]{1,40}$`), room ids allow letters/digits/`_`/`-`
  up to 40 characters, input is capped at 4000 characters and bodies at 16 KB.
- **Outside content = data.** The task template and the CEO prompt hand user requests and file/web/mail content
  over as labelled data; "do this" sentences inside them are not instructions. That alone is not a defence: the
  real limit is keeping `allowed_tools` narrow.
- **Default denials are added to every agent:** reading `.env`, `rm`, `git push`, `curl`, `open`.
- **Only the `engineer` agent can write**, only inside its own `cwd`, and never with `git push`.
- **Sending mail, publishing and spending money stay with the user.** No agent gets those permissions; output is
  a draft, and approval happens through the "CEO asks" card.
- The frontend prints agent text with `textContent` (never interpreted as HTML).
- Working data (`events.jsonl`, `state/`, `runs/`, `output/`, `memory/*.md`) is gitignored; keep it out of the repo.

## Files

| File | What |
| --- | --- |
| `server.py` | HTTP + SSE server, CEO call, run dispatch |
| `runner.py` | one agent run (inside a tmux window) |
| `bridge.py` | terminal bridge (read-only) |
| `token_counter.py` | daily token counter |
| `common.py` | paths, agent table, event log |
| `agents.example.json`, `bridge.example.json` | empty templates |
| `CLAUDE.md` | CEO constitution template |
| `frontend/` | `index.html` (scene + panels), `cat.js` (procedural animal), `meme.js` (meme poses), `portrait.js` (panel avatars), `decor.js` (room props), `demo-data.json` |

## License

PolyForm Noncommercial 1.0.0. In short:

- ✅ Download it, run it on your own machine, connect your own agents.
- ✅ Change the design as you like; share it noncommercially (keeping this licence and the copyright notice).
- ❌ Selling it, shipping it inside a paid product/course/template pack, or installing it for a client as a paid
  service.

Ask on GitHub for commercial use. The binding text is [LICENSE](LICENSE).
