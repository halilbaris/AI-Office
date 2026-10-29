"""Live terminal bridge: binds the Claude Code sessions you open yourself to office agents.

Read-only. ~/.claude/sessions/<pid>.json lists live sessions; ~/.claude/projects/<cwd>/<sessionId>.jsonl
holds the transcript, tailed by offset. Only the tool name plus a short target (file name, pattern,
description, the first word of a Bash command) and "got a new task" information are written to the
event stream; message text, prompt content and file content are never written.
Mapping: bridge.json (copy from bridge.example.json). A session whose cwd or tmux session name contains
any string from the `hide` list is never shown, whatever the mapping.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from urllib.parse import urlparse

import common
import token_counter

HOME = os.path.expanduser("~")
SESSIONS_DIR = os.path.join(HOME, ".claude", "sessions")
PROJECTS_DIR = os.path.join(HOME, ".claude", "projects")
MAP_FILE = os.environ.get("OFFICE_BRIDGE", os.path.join(common.ROOT, "bridge.json"))
INTERVAL_S = 2.0
WORKING_S = 20
MAX_READ = 2_000_000          # max bytes read from a transcript per cycle
FIRST_TAIL = 256_000          # tail read on first sight to find the last tool
DETAIL_MAX = 80
TMUX_REFRESH_S = 6
TOKEN_EVENT_S = 3.0           # at most one token event per agent per 3s
DESKTOP_REFRESH_S = 10        # desktop transcript scan interval
DESKTOP_OPEN_S = 30 * 60      # a desktop session untouched this long counts as closed
DESKTOP_HEAD = 64_000         # head read for entrypoint/cwd
DESKTOP_ENTRYPOINT = "claude-desktop"
RECORDED_ENTRYPOINT = "cli"   # the only entrypoint that writes to ~/.claude/sessions (terminal, tmux, IDE)
SUBAGENT_TAIL = 256_000       # tail read for a subagent's last tool
SUBAGENT_MAX = 8              # max subagents shown per session
MESSAGE_KIND = re.compile(r'"type"\s*:\s*"(user|assistant)"')


def is_hidden(cwd, tmux_session, hide):
    """bridge.json `hide`: a session carrying any of these in its cwd or tmux session name is never shown."""
    c, t = (cwd or "").lower(), (tmux_session or "").lower()
    return any(isinstance(p, str) and p.strip() and (p.lower() in c or p.lower() == t) for p in (hide or []))


def nearest(mapping, cwd):
    """Mapping value for this cwd or its closest parent (a session opened in a subfolder also matches)."""
    path = os.path.normpath(cwd or "/")
    while True:
        if path in mapping:
            return mapping[path]
        parent = os.path.dirname(path)
        if parent == path:
            return None
        path = parent


def project_dir(cwd):
    return re.sub(r"[^A-Za-z0-9]", "-", cwd)


def _clean(s, n=DETAIL_MAX):
    s = re.sub(r"[\x00-\x1f]+", " ", str(s)).strip()
    return s[:n]


def tool_target(name, tool_input):
    """Same 'key=value' shape as runner.summarize_tool, but only a safe short fragment."""
    if not isinstance(tool_input, dict):
        return ""
    if name == "Bash":
        # only the first word of the first meaningful command; "cd x &&" prefixes and FOO=bar
        # assignments (which may hold secrets) are skipped
        for piece in re.split(r"&&|\|\||;|\||\n", str(tool_input.get("command") or "")):
            words = [w for w in piece.split() if "=" not in w]
            if words and words[0] not in ("cd", "export", "set", "source", "."):
                return "command=" + _clean(os.path.basename(words[0]), 40)
        return ""
    for key in ("file_path", "notebook_path", "path"):
        if tool_input.get(key):
            return "file_path=" + _clean(os.path.basename(str(tool_input[key]).rstrip("/")), 60)
    if tool_input.get("pattern"):
        return "pattern=" + _clean(tool_input["pattern"], 60)
    if tool_input.get("description"):
        return "description=" + _clean(tool_input["description"], 60)
    if tool_input.get("url"):
        return "url=" + _clean(urlparse(str(tool_input["url"])).hostname or "", 60)
    return ""


def is_new_prompt(row):
    """A new prompt typed by the user? (not a tool result, meta row or system injection)"""
    if row.get("type") != "user" or row.get("isMeta") or row.get("isSidechain"):
        return False
    if "toolUseResult" in row:
        return False
    content = (row.get("message") or {}).get("content")
    if isinstance(content, str):
        return bool(content.strip()) and not content.lstrip().startswith("<")
    if isinstance(content, list):
        kinds = {p.get("type") for p in content if isinstance(p, dict)}
        return "tool_result" not in kinds and bool(kinds & {"text", "image"})
    return False


def find_model(raw):
    """Model id of the last assistant message in a raw JSONL chunk (e.g. claude-opus-5-5)."""
    latest = None
    for row in raw.splitlines():
        if '"model"' not in row:
            continue
        try:
            d = json.loads(row)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if isinstance(d, dict) and d.get("type") == "assistant" and not d.get("isSidechain"):
            m = (d.get("message") or {}).get("model")
            if isinstance(m, str) and re.fullmatch(r"[a-z0-9.-]{3,60}", m) and m != "<synthetic>":
                latest = m
    return latest


def parse_lines(raw, sidechain=False):
    """Extracts (tool, target) events and the new-prompt flag from a raw JSONL chunk.
    sidechain=False: subagent (isSidechain) rows are skipped; True when reading the subagent's own transcript."""
    tools, new_task = [], False
    for row in raw.splitlines():
        try:
            d = json.loads(row)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if not isinstance(d, dict) or (d.get("isSidechain") and not sidechain):
            continue
        if d.get("type") == "assistant":
            for p in (d.get("message") or {}).get("content") or []:
                if isinstance(p, dict) and p.get("type") == "tool_use":
                    name = _clean(p.get("name") or "tool", 60)
                    tools.append((name, tool_target(name, p.get("input"))))
        elif is_new_prompt(d):
            new_task = True
    return tools, new_task


def token_lines(raw):
    """Assistant usage rows from a raw JSONL chunk: [(local_date, message_id, usage)]. Text is never read."""
    out = []
    for row in raw.splitlines():
        if '"usage"' not in row or '"assistant"' not in row:
            continue
        try:
            d = json.loads(row)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if not isinstance(d, dict) or d.get("type") != "assistant" or d.get("isSidechain"):
            continue
        m = d.get("message") or {}
        date = token_counter.local_date(d.get("timestamp"))
        if date and isinstance(m.get("usage"), dict):
            out.append((date, m.get("id"), m["usage"]))
    return out


def feed_tokens(record, raw, only_date=None):
    """Feeds row usage into the per-date deduper of the session. Returns the dates that changed."""
    changed = set()
    for date, mid, usage in token_lines(raw):
        if only_date and date != only_date:
            continue
        deduper = record["dedupers"].setdefault(date, token_counter.MessageDeduper())
        if deduper.feed(mid, usage):
            changed.add(date)
    return changed


def transcript_head(path):
    """(entrypoint, cwd) from the head of the transcript. No message text is read; only these two fields."""
    try:
        with open(path, "rb") as f:
            head = f.read(DESKTOP_HEAD).decode("utf-8", "replace")
    except OSError:
        return None, None
    entry = re.search(r'"entrypoint"\s*:\s*"([a-z-]{1,40})"', head)
    cwd = re.search(r'"cwd"\s*:\s*"((?:[^"\\]|\\.){1,1000})"', head)
    if not entry or not cwd:
        return (entry.group(1) if entry else None), None
    try:
        cwd_value = json.loads(f'"{cwd.group(1)}"')
    except json.JSONDecodeError:
        return entry.group(1), None
    return entry.group(1), cwd_value


def last_message_time(path):
    """Time (epoch) of the last user/assistant row in the transcript. When the desktop app reopens an old
    chat it only appends a meta row; that is why this is used instead of file mtime. No text is read,
    only type + timestamp."""
    try:
        with open(path, "rb") as f:
            f.seek(max(0, os.path.getsize(path) - FIRST_TAIL))
            tail = f.read().decode("utf-8", "replace")
    except OSError:
        return 0.0
    for row in reversed(tail.splitlines()):
        if '"timestamp"' not in row or not MESSAGE_KIND.search(row):
            continue
        try:
            d = json.loads(row)
            return datetime.fromisoformat(str(d["timestamp"]).replace("Z", "+00:00")).timestamp()
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            continue
    return 0.0


def scan_history(record, size):
    """Once at startup: streams the transcript from the start and counts ONLY today's usage (no events)."""
    day = common.today()
    with open(record["path"], "rb") as f:
        read = 0
        for row in f:
            read += len(row)
            if read > size:
                break
            if b'"usage"' in row:
                feed_tokens(record, row.decode("utf-8", "replace"), only_date=day)
    if day in record["dedupers"]:
        record["token_pending"].add(day)


def subagent_summary(jsonl, meta_path):
    """Subagent type/task title/model from meta.json + last tool from the transcript tail. No message text."""
    try:
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, json.JSONDecodeError):
        meta = {}
    if not isinstance(meta, dict):
        meta = {}
    last_tool = last_target = None
    try:
        size = os.path.getsize(jsonl)
        with open(jsonl, "rb") as f:
            f.seek(max(0, size - SUBAGENT_TAIL))
            chunk = f.read().decode("utf-8", "replace")
        tools, _ = parse_lines(chunk.split("\n", 1)[-1] if size > SUBAGENT_TAIL else chunk, sidechain=True)
        if tools:
            last_tool, last_target = tools[-1]
    except OSError:
        chunk = ""
    return {"type": _clean(meta.get("agentType") or "subagent", 40), "task": _clean(meta.get("description") or "", 80),
            "model": _clean(meta.get("model") or find_model(chunk) or "", 40),
            "last_tool": last_tool, "last_target": last_target}


class Bridge:
    def __init__(self):
        self.lock = threading.Lock()
        self.sessions = {}           # pid -> state dict
        self.windows = {}            # "session:@id" -> window name
        self.tmux_at = 0.0
        self.mapping = {}
        self.mapping_mtime = None
        self.agents = {}
        self.token_at = {}           # agent -> last token event time
        self.desktop = {}            # "desktop:<sid>" -> synthetic session record (cwd, sessionId, name)
        self.desktop_at = 0.0
        self.head_cache = {}         # transcript path -> (entrypoint, cwd)
        self.time_cache = {}         # transcript path -> (mtime, last message time)
        self.warned = set()          # sessionIds already warned about
        self.subagent_cache = {}     # subagent transcript -> (mtime, summary)

    # ---------- configuration ----------
    def load_map(self):
        try:
            m = os.path.getmtime(MAP_FILE)
        except OSError:
            self.mapping = {}
            return
        if m == self.mapping_mtime:
            return
        try:
            with open(MAP_FILE, encoding="utf-8") as f:
                data = json.load(f)
            self.mapping = data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            self.mapping = {}
        self.mapping_mtime = m

    def refresh_tmux(self):
        if time.time() - self.tmux_at < TMUX_REFRESH_S:
            return
        self.tmux_at = time.time()
        tmux = shutil.which("tmux") or "/opt/homebrew/bin/tmux"
        try:
            output = subprocess.run([tmux, "list-windows", "-a", "-F", "#{session_name}:#{window_id} #{window_name}"],
                                    capture_output=True, text=True, timeout=3).stdout
        except (OSError, subprocess.SubprocessError):
            return
        fresh = {}
        for row in output.splitlines():
            key, _, name = row.partition(" ")
            fresh[key] = name
        self.windows = fresh

    def find_agent(self, cwd, tmux_session, window_name, interactive=True):
        """(agent, hidden): mapping order is tmux window name > cwd (closest parent included) > `default`
        (first agent when absent; "" hides unmapped sessions). Non-interactive runs such as `claude -p`
        (the office's own runs included) never fall back to the default, they need an explicit mapping."""
        m = self.mapping
        if is_hidden(cwd, tmux_session, m.get("hide")):
            return None, True
        if cwd in {os.path.expanduser(x) for x in (m.get("skip_cwd") or [])}:
            return None, True
        cwd_map = {os.path.normpath(os.path.expanduser(k)): v for k, v in (m.get("cwd") or {}).items()}
        window_map = {os.path.normpath(os.path.expanduser(k)): v for k, v in (m.get("window") or {}).items()}
        windows = nearest(window_map, cwd)
        candidates = ((windows or {}).get(window_name or "") if isinstance(windows, dict) else None,
                      nearest(cwd_map, cwd), m.get("default", self.first_agent()) if interactive else None)
        for agent in candidates:
            if isinstance(agent, str) and agent != "ceo" and agent in self.agents:
                return agent, False
        return None, False

    def first_agent(self):
        """Without `default`, an unmapped session shows on the first agent: no session disappears silently."""
        return next((a for a in self.agents if a != "ceo"), None)

    def warn_unmapped(self, sid, cwd, window_name):
        """One hint per session in the server log (folder and window name only)."""
        if sid in self.warned:
            return
        self.warned.add(sid)
        name = os.path.basename(MAP_FILE)
        sys.stderr.write(f"bridge: session not mapped to any agent (cwd={cwd}, tmux window={window_name or '-'}). "
                         f"Add \"cwd\": {{\"{cwd}\": \"<agent-id>\"}} or \"default\": \"<agent-id>\" to {name}.\n")
        sys.stderr.flush()

    # ---------- scanning ----------
    def live_sessions(self):
        try:
            names = os.listdir(SESSIONS_DIR)
        except OSError:
            return {}
        found = {}
        for name in names:
            if not re.fullmatch(r"\d+\.json", name):
                continue
            pid = int(name[:-5])
            if not common.process_alive(pid):
                continue
            try:
                with open(os.path.join(SESSIONS_DIR, name), encoding="utf-8") as f:
                    d = json.load(f)
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(d, dict) and d.get("sessionId") and d.get("cwd"):
                found[pid] = d
        found.update(self.desktop_sessions())
        return found

    def desktop_sessions(self):
        """Non-terminal sessions (Claude desktop app, IDE plugins) leave nothing in ~/.claude/sessions;
        they only write transcripts. A transcript with a message inside the last DESKTOP_OPEN_S whose
        entrypoint is neither `cli` nor `sdk-*` counts as an open session. No tmux window exists, so they
        bind through `cwd` / `default`."""
        if time.time() - self.desktop_at < DESKTOP_REFRESH_S:
            return self.desktop
        self.desktop_at = time.time()
        cutoff, fresh, seen = time.time() - DESKTOP_OPEN_S, {}, {}
        try:
            folders = list(os.scandir(PROJECTS_DIR))
        except OSError:
            return {}
        for folder in folders:
            if not folder.is_dir(follow_symlinks=False):     # folder mtime does not change on write
                continue
            try:
                files = list(os.scandir(folder.path))
            except OSError:
                continue
            for file in files:
                if not file.name.endswith(".jsonl") or file.stat().st_mtime < cutoff:
                    continue
                sid = file.name[:-6]
                if not re.fullmatch(r"[A-Za-z0-9-]+", sid):
                    continue
                entry, cwd = self.head_cache.get(file.path) or transcript_head(file.path)
                if entry and cwd:          # an incomplete head (brand new file) is not cached; retried next cycle
                    seen[file.path] = (entry, cwd)
                if not entry or entry == RECORDED_ENTRYPOINT or entry.startswith("sdk") or not cwd \
                        or project_dir(cwd) != folder.name:
                    continue
                if self.message_time(file) < cutoff:      # only a meta row was appended to an old chat
                    continue
                source = "desktop" if entry == DESKTOP_ENTRYPOINT else entry.replace("claude-", "")
                fresh[f"desktop:{sid}"] = {"sessionId": sid, "cwd": cwd, "entrypoint": entry,
                                           "name": f"{source} · {os.path.basename(cwd) or cwd}"}
        self.head_cache = seen
        self.time_cache = {y: v for y, v in self.time_cache.items() if y in seen}
        self.desktop = fresh
        return fresh

    def message_time(self, file):
        """last_message_time from cache unless the file mtime changed."""
        mtime = file.stat().st_mtime
        previous = self.time_cache.get(file.path)
        if not previous or previous[0] != mtime:
            previous = (mtime, last_message_time(file.path))
            self.time_cache[file.path] = previous
        return previous[1]

    def build_record(self, pid, d, agent, tmux_session, window_name):
        cwd, sid = d["cwd"], str(d["sessionId"])
        path = os.path.join(PROJECTS_DIR, project_dir(cwd), f"{sid}.jsonl") \
            if re.fullmatch(r"[A-Za-z0-9-]+", sid) else None
        record = {"pid": pid, "sid": sid, "path": path, "offset": 0, "last_line_ts": 0.0,
                  "agent": agent, "room": self.agents[agent]["room"],
                  "session_name": _clean(d.get("name") or f"pid-{pid}", 60),
                  "window_name": _clean(window_name or "", 60), "tmux_session": tmux_session,
                  "last_tool": None, "last_target": None, "model": None, "status": None, "published": None,
                  "dedupers": {}, "token_pending": set()}
        if path and os.path.exists(path):
            size = os.path.getsize(path)
            scan_history(record, size)
            record["offset"] = size
            record["last_line_ts"] = os.path.getmtime(path)
            with open(path, "rb") as f:          # only to learn the last tool; no events are written
                f.seek(max(0, size - FIRST_TAIL))
                chunk = f.read().decode("utf-8", "replace")
            tools, _ = parse_lines(chunk.split("\n", 1)[-1] if size > FIRST_TAIL else chunk)
            record["model"] = find_model(chunk) or record["model"]
            if tools:
                record["last_tool"], record["last_target"] = tools[-1]
        record["token_first_written"] = not record["token_pending"]   # no history today → first live change emits
        return record

    def read_new(self, record):
        """Reads new transcript rows; advances the offset only to a complete line end."""
        if not record["path"]:
            return [], False
        try:
            size = os.path.getsize(record["path"])
        except OSError:
            return [], False
        if size < record["offset"]:              # file shrank (unexpected): continue from the end
            record["offset"] = size
        if size == record["offset"]:
            return [], False
        with open(record["path"], "rb") as f:
            f.seek(record["offset"])
            chunk = f.read(min(size - record["offset"], MAX_READ))
        last = chunk.rfind(b"\n")
        if last < 0:
            return [], False
        record["offset"] += last + 1
        record["last_line_ts"] = time.time()
        text = chunk[:last].decode("utf-8", "replace")
        record["token_pending"] |= feed_tokens(record, text)
        record["model"] = find_model(text) or record["model"]
        return parse_lines(text)

    @staticmethod
    def compute_status(record, d):
        if time.time() - record["last_line_ts"] < WORKING_S or d.get("status") == "busy":
            return "working"
        return "waiting"

    def to_api(self, record):
        return {"agent": record["agent"], "room": record["room"], "session_name": record["session_name"],
                "window_name": record["window_name"], "status": record["status"],
                "last_tool": record["last_tool"], "last_target": record["last_target"],
                "model": record.get("model"),
                "time": time.strftime("%Y-%m-%dT%H:%M:%S",
                                      time.localtime(record["last_line_ts"] or time.time()))}

    def cycle(self):
        self.load_map()
        _, self.agents = common.load_agents()
        self.refresh_tmux()
        live = self.live_sessions()
        events = []
        with self.lock:
            for pid in list(self.sessions):
                if pid not in live or str(live[pid]["sessionId"]) != self.sessions[pid]["sid"]:
                    record = self.sessions.pop(pid)
                    if record["published"]:
                        events.append({"type": "terminal_status", **self.to_api({**record, "status": "closed"})})
            for pid, d in live.items():
                tmux = str(d.get("tmux") or "")
                tmux_session = tmux.split(":", 1)[0] if tmux else ""
                window_name = self.windows.get(tmux.split(".", 1)[0], "") if tmux else ""
                interactive = not str(d.get("entrypoint") or "").startswith("sdk")
                agent, hidden = self.find_agent(d["cwd"], tmux_session, window_name, interactive)
                record = self.sessions.get(pid)
                if not agent and not hidden and interactive:
                    self.warn_unmapped(str(d["sessionId"]), d["cwd"], window_name)
                if not agent:
                    if record:
                        self.sessions.pop(pid)
                        if record["published"]:
                            events.append({"type": "terminal_status",
                                           **self.to_api({**record, "status": "closed"})})
                    continue
                if not record or record["agent"] != agent:
                    record = self.build_record(pid, d, agent, tmux_session, window_name)
                    self.sessions[pid] = record
                else:
                    record["window_name"] = _clean(window_name, 60)
                    tools, new_task = self.read_new(record)
                    if new_task:
                        events.append({"type": "terminal_tool", "agent": agent, "room": record["room"],
                                       "session_name": record["session_name"], "tool": "NewTask", "detail": ""})
                    if tools:
                        record["last_tool"], record["last_target"] = tools[-1]
                        # one tool event per session per cycle: keeps the stream readable
                        events.append({"type": "terminal_tool", "agent": agent, "room": record["room"],
                                       "session_name": record["session_name"], "tool": record["last_tool"],
                                       "detail": record["last_target"] or ""})
                record["status"] = self.compute_status(record, d)
                if record["published"] != record["status"]:
                    record["published"] = record["status"]
                    events.append({"type": "terminal_status", **self.to_api(record)})
            events += self.write_tokens()
        for e in events:
            common.write_event(e)

    def write_tokens(self):
        """Writes pending session totals to the file; at most one event per agent per TOKEN_EVENT_S.
        Totals from the first scan are counted but emit no event."""
        now, events = time.time(), []
        for record in self.sessions.values():
            if not record["token_pending"] or now - self.token_at.get(record["agent"], 0) < TOKEN_EVENT_S:
                continue
            first = not record["token_first_written"]
            agent_day = None
            for date in sorted(record["token_pending"]):
                day = token_counter.put_record(date, "_sessions", record["sid"], record["agent"],
                                               record["dedupers"][date].total)
                if date == common.today():
                    agent_day = day
            record["token_pending"] = set()
            record["token_first_written"] = True
            if first or agent_day is None:
                continue
            self.token_at[record["agent"]] = now
            events.append({"type": "token", "agent": record["agent"], "room": record["room"],
                           "source": "terminal", "session_name": record["session_name"],
                           "agent_day": agent_day})
        return events

    def subagents(self, record):
        """Subagents of the session written within the last DESKTOP_OPEN_S (<sid>/subagents/agent-*.jsonl),
        newest first."""
        if not record["path"]:
            return []
        folder = os.path.join(record["path"][:-6], "subagents")
        try:
            entries = [e for e in os.scandir(folder) if e.name.startswith("agent-") and e.name.endswith(".jsonl")]
        except OSError:
            return []
        now, out = time.time(), []
        for entry in entries:
            try:
                mtime = entry.stat().st_mtime
            except OSError:
                continue
            if now - mtime > DESKTOP_OPEN_S:
                continue
            previous = self.subagent_cache.get(entry.path)
            summary = previous[1] if previous and previous[0] == mtime \
                else subagent_summary(entry.path, entry.path[:-6] + ".meta.json")
            self.subagent_cache[entry.path] = (mtime, summary)
            out.append({**summary, "status": "working" if now - mtime < WORKING_S else "done",
                        "time": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(mtime))})
        return sorted(out, key=lambda x: x["time"], reverse=True)[:SUBAGENT_MAX]

    def list_sessions(self):
        with self.lock:
            records = list(self.sessions.values())
        out = [{**self.to_api(r), "subagents": self.subagents(r)} for r in records]
        cutoff = time.time() - DESKTOP_OPEN_S       # closed subagents do not pile up in the cache
        self.subagent_cache = {y: v for y, v in self.subagent_cache.items() if v[0] >= cutoff}
        return sorted(out, key=lambda x: (x["agent"], x["session_name"]))

    def loop(self):
        while True:
            try:
                self.cycle()
            except Exception as e:  # a bridge error never takes the server down
                common.write_event({"type": "error", "agent": "ceo",
                                    "detail": f"terminal bridge: {type(e).__name__}"})
                time.sleep(30)
            time.sleep(INTERVAL_S)

    def start(self):
        threading.Thread(target=self.loop, name="terminal-bridge", daemon=True).start()
