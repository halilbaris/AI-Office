"""Per-agent daily token counter. Real usage fields only; no cost estimation here.

Persistent file: state/token-<YYYY-MM-DD>.json
  {"<agent>": {"office": {4 fields}, "terminal": {4 fields}},   ← rolled-up view (derived)
   "_runs": {"<run_id>": {"agent": .., "usage": {4 fields}}},   ← per office run (written by replace)
   "_sessions": {"<session_id>": {"agent": .., "usage": {..}}}}  ← per terminal session (written by replace)
Records are replaced, never appended: counting the same run/session twice does not double up.
Cross-process safety (server + runner) is provided by an fcntl lock.
"""
import fcntl
import json
import os
from contextlib import contextmanager
from datetime import datetime

import common

FIELDS = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
LOCK_FILE = os.path.join(common.STATE_DIR, "token.lock")


def empty():
    return {k: 0 for k in FIELDS}


def usage_of(u):
    """Only the four numeric fields from a raw usage dict."""
    u = u if isinstance(u, dict) else {}
    return {k: int(u.get(k) or 0) if isinstance(u.get(k), (int, float)) else 0 for k in FIELDS}


def add_totals(*usages):
    t = empty()
    for u in usages:
        for k in FIELDS:
            t[k] += int((u or {}).get(k) or 0)
    return t


class MessageDeduper:
    """Deduplicates by message.id. Repeated rows with the same id count only the increase."""

    def __init__(self):
        self.seen = {}
        self.total = empty()

    def feed(self, message_id, usage):
        u = usage_of(usage)
        previous = self.seen.get(message_id, empty()) if message_id else empty()
        current = {k: max(u[k], previous[k]) for k in FIELDS}
        delta = {k: current[k] - previous[k] for k in FIELDS}
        if message_id:
            self.seen[message_id] = current
        if not any(delta.values()):
            return False
        self.total = add_totals(self.total, delta)
        return True


def path_for(date):
    return os.path.join(common.STATE_DIR, f"token-{date}.json")


def _read(date):
    try:
        with open(path_for(date), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


@contextmanager
def _locked():
    os.makedirs(common.STATE_DIR, exist_ok=True)
    with open(LOCK_FILE, "a") as l:
        fcntl.flock(l, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(l, fcntl.LOCK_UN)


def _build_summary(data):
    """_runs + _sessions → {agent: {office, terminal}} view."""
    agents = {}
    for source, key in (("office", "_runs"), ("terminal", "_sessions")):
        for record in (data.get(key) or {}).values():
            agent = record.get("agent")
            if not agent:
                continue
            a = agents.setdefault(agent, {"office": empty(), "terminal": empty()})
            a[source] = add_totals(a[source], record.get("usage"))
    return agents


def _write(date, data):
    clean = {"_runs": data.get("_runs") or {}, "_sessions": data.get("_sessions") or {}}
    full = {**_build_summary(clean), **clean}
    tmp = path_for(date) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(full, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path_for(date))
    return full


def put_record(date, kind, key, agent, usage):
    """kind: '_runs' | '_sessions'. Replaces the record; returns the agent's {office, terminal} for that day."""
    with _locked():
        data = _read(date)
        section = dict(data.get(kind) or {})
        section[key] = {"agent": agent, "usage": usage_of(usage)}
        full = _write(date, {**data, kind: section})
    return full.get(agent, {"office": empty(), "terminal": empty()})


def put_run_if_missing(date, run_id, agent, usage):
    """Adds a past run (from events.jsonl) only when the file does not have it yet."""
    with _locked():
        data = _read(date)
        if run_id in (data.get("_runs") or {}):
            return False
        section = {**(data.get("_runs") or {}), run_id: {"agent": agent, "usage": usage_of(usage)}}
        _write(date, {**data, "_runs": section})
    return True


def day_summary(date):
    return _build_summary(_read(date))


def agent_day(date, agent):
    return day_summary(date).get(agent, {"office": empty(), "terminal": empty()})


def to_api(agent_record):
    """{office, terminal} → API shape."""
    o, t = agent_record.get("office") or empty(), agent_record.get("terminal") or empty()
    h = add_totals(o, t)
    return {"total": sum(h.values()), "input": h["input_tokens"], "output": h["output_tokens"],
            "cache_write": h["cache_creation_input_tokens"], "cache_read": h["cache_read_input_tokens"],
            "office_total": sum(o.values()), "terminal_total": sum(t.values())}


def api_response():
    date = common.today()
    agents = {a: to_api(k) for a, k in day_summary(date).items()}
    return {"date": date, "agents": agents, "grand_total": sum(a["total"] for a in agents.values())}


def local_date(iso_time):
    """Transcript timestamp (UTC, 'Z') → local YYYY-MM-DD; None when unparseable."""
    try:
        return datetime.fromisoformat(str(iso_time).replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def rebuild_from_events(events):
    """Backfills usage from today's run_finished/ceo_finished events when the counter file lacks it."""
    date = common.today()
    for e in events:
        if e.get("type") not in ("run_finished", "ceo_finished") or not str(e.get("time", "")).startswith(date):
            continue
        if e.get("run_id") and e.get("agent") and e.get("usage"):
            put_run_if_missing(date, e["run_id"], e["agent"], e["usage"])
