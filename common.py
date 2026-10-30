"""MyOffice shared helpers: paths, agent table, event log, state files."""
import fcntl
import json
import os
import re
import time
from contextlib import contextmanager
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
# Config: copy agents.example.json to agents.json (agents.json is gitignored).
AGENTS_FILE = os.environ.get("OFFICE_AGENTS", os.path.join(ROOT, "agents.json"))
EVENTS = os.path.join(ROOT, "events.jsonl")
STATE_DIR = os.path.join(ROOT, "state")
RUNS_DIR = os.path.join(ROOT, "runs")
OUTPUT_DIR = os.path.join(ROOT, "output")
MEMORY_DIR = os.path.join(ROOT, "memory")

MAX_INPUT = 4000
MAX_MEMORY_ENTRY = 1200
AGENT_ID_PATTERN = re.compile(r"^[a-z0-9-]{1,40}$")
# Room ids are free-form (unknown rooms are created on the scene) but they end up in prompts and
# events, so they are limited to letters/digits/_/- and 40 characters.
ROOM_ID_PATTERN = re.compile(r"[\w-]{1,40}")


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def today():
    return datetime.now().strftime("%Y-%m-%d")


class ConfigError(Exception):
    pass


def load_agents():
    try:
        with open(AGENTS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError as e:
        raise ConfigError(
            f"{os.path.basename(AGENTS_FILE)} is missing. First: cp agents.example.json agents.json") from e
    if not isinstance(data, dict) or not isinstance(data.get("agents"), list):
        raise ConfigError("agents.json must contain an 'agents' list")
    table = {}
    for agent in data["agents"]:
        if not AGENT_ID_PATTERN.match(agent["id"]):
            raise ValueError(f"invalid agent id: {agent['id']!r}")
        room = agent.get("room") or "general"
        if not isinstance(room, str) or not ROOM_ID_PATTERN.fullmatch(room):
            raise ValueError(f"invalid room id: {room!r} (agent {agent['id']})")
        installed = os.path.isdir(os.path.expanduser(agent.get("cwd") or ""))
        table[agent["id"]] = {**agent, "room": room, "cwd": os.path.expanduser(agent.get("cwd") or ""),
                              "installed": installed}
    return data, table


DEFAULT_TOKEN_CAP = 2_000_000   # fresh tokens of office runs per day (agents + CEO); 0 turns the cap off


def _cap(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return DEFAULT_TOKEN_CAP


def settings(data):
    """UI settings: greeting name, brand and the welcome card options. All optional."""
    s = data.get("settings") if isinstance(data.get("settings"), dict) else {}
    return {
        "user": str(s.get("user") or "")[:40],
        "brand": str(s.get("brand") or "MyOffice")[:40],
        "greeting": str(s.get("greeting") or "")[:80],
        "note": str(s.get("note") or "")[:200],
        "show_token_summary": bool(s.get("show_token_summary", True)),
        "show_sessions": bool(s.get("show_sessions", True)),
        "daily_token_cap": _cap(s.get("daily_token_cap")),
    }


def save_agents(data):
    """Writes agents.json atomically (tmp file + replace), keeping the existing key order."""
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = AGENTS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, AGENTS_FILE)


@contextmanager
def config_lock():
    """Cross-process lock so a UI save and a run start never interleave on agents.json."""
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(os.path.join(STATE_DIR, "agents.lock"), "a") as l:
        fcntl.flock(l, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(l, fcntl.LOCK_UN)


def write_event(event):
    """Appends one line to events.jsonl (locked across processes)."""
    line = json.dumps({"time": now_iso(), **event}, ensure_ascii=False)
    with open(EVENTS, "a", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.write(line + "\n")
            f.flush()
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def state_path(agent_id):
    return os.path.join(STATE_DIR, f"{agent_id}.json")


def read_state(agent_id):
    try:
        with open(state_path(agent_id), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def write_state(agent_id, state):
    tmp = state_path(agent_id) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)
    os.replace(tmp, state_path(agent_id))


def process_alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except (ProcessLookupError, ValueError):
        return False
    except PermissionError:
        return True


def agent_busy(agent_id):
    """Is the agent running right now? A stale 'running' record from a dead process does not count."""
    s = read_state(agent_id)
    if not s or s.get("status") not in ("starting", "running"):
        return False
    if process_alive(s.get("pid")):
        return True
    # The tmux window may not have written its pid yet.
    return s.get("status") == "starting" and time.time() - s.get("started_ts", 0) < 30
