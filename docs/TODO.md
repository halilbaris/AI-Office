# MyOffice backlog

Open items, in the order they were discussed. Nothing here runs by itself; each item is a decision, not a promise.

## 1. Animals instead of cats (species)
The rig is parametric (body, head, ears, tail, paws, poses, idle animations), so a species **profile** is enough:
`"species": "owl" | "kangal" | "raven" | "fox" | "cat"` per agent in `agents.json`, default `cat`.

Proposed set (Anatolian flavour): CEO owl, Analyst kangal, Engineer raven, Writer Van cat.
Readability at the default camera distance needs three things together: a distinct silhouette (height/form), a
desk prop that names the species (owl perch, raven stand, raccoon drawer), and a small species mark in the name
badge. `frontend/cat.js` becomes `creature.js` with a per-species profile table.

## 2. Model settings
Done: the Settings tab edits per-agent models, rooms and greeting card; agents can run on Claude Code or OpenCode.
Still to decide:
- `settings.default_model` and `fallback_model` (runner passes `--fallback-model`);
- per-run caps (`max_turns`, timeout) so a runaway agent cannot burn a budget;
- showing OpenCode usage in the token counter (the CLI does not report it the way `claude -p` does).
- **Check first:** `~/.claude/settings.json` routes Claude Code through the local `cc-switch` proxy
  (`127.0.0.1:15721`), where `haiku`, `sonnet` and `opus` all map to one model. Until that mapping changes,
  switching aliases in `agents.json` changes little.

## 3. Tool enforcement on the OpenCode runtime
`claude -p` enforces `allowed_tools`/`default_denied_tools`; `opencode run` only obeys the project's
`opencode.json`. Options: keep security-critical agents on Claude, or add three shared agents in
`~/.config/opencode/opencode.json` (`office-read`, `office-write`, `office-deploy`) and pass them with `--agent`.

## 4. Office UI polish (from the first screenshot)
- Default camera is too far: agents read as a blob and the labels carry all the information.
- The right-hand cards overlap the scene; the third column needs to scale down or collapse.
- Room names on the floor get clipped at the edges.

## 5. Preset tasks
The roster ships with empty `preset_tasks` on purpose. Fill them once the daily rhythm is clear (one or two per
agent, each answering a question you actually ask every week).
