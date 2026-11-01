"""Normalise external agent activity into MyOffice terminal events.

The wrapper (`myoffice run`), hooks, log watchers and the OpenCode watcher all
send small payloads here. This module maps the session to an office agent and
writes the same terminal_status / terminal_tool events the Claude bridge uses.

Privacy: only the tool name and a short target are stored. Prompts, model
output and file contents are never written.
"""
import json
import threading
import time

import common
import providers.mapping as mapping

SESSION_MAX = 60
TARGET_MAX = 80
KEEP_DONE_S = 6 * 3600

_lock = threading.Lock()
_sessions = {}


def _clip(value, limit):
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "\u2026"


def _iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _agents():
    try:
        _, table = common.load_agents()
        return table
    except (common.ConfigError, ValueError, OSError):
        return {}


def _public(record):
    """The terminal API shape consumed by the frontend."""
    return {
        "agent": record.get("agent"),
        "room": record.get("room") or "general",
        "session_name": record.get("session_name"),
        "window_name": "",
        "status": record.get("status") or "working",
        "last_tool": record.get("last_tool"),
        "last_target": record.get("last_target"),
        "model": record.get("model"),
        "source": record.get("source"),
        "time": record.get("time") or _iso(),
    }


def _resolve_agent(payload, agents):
    agent = payload.get("agent")
    if agent:
        if agent == "ceo" or agent not in agents:
            raise ValueError(f"unknown agent: {agent}")
        return agent, agents[agent].get("room") or "general"

    cwd = payload.get("cwd") or payload.get("directory") or ""
    agent, room = mapping.resolve(cwd, agents)
    if not agent:
        raise ValueError("no office agent matches this cwd; add it to bridge.json or pass agent")
    return agent, room


def handle(payload):
    """Validate one payload, update the session registry and write an event.

    Returns the session record (or None for a payload that only carries a
    token total, which is handled by token_counter).
    """
    if not isinstance(payload, dict):
        raise ValueError("event must be an object")

    kind = str(payload.get("event") or payload.get("type") or "tool").lower()
    source = _clip(payload.get("source") or "external", 20)
    session = _clip(payload.get("session") or payload.get("session_id") or "", 80)
    if not session:
        raise ValueError("session is required")

    agents = _agents()
    agent, room = _resolve_agent(payload, agents)
    name = _clip(payload.get("session_name") or f"{source} \u00b7 {session}", SESSION_MAX)
    model = _clip(payload.get("model") or "", 60) or None

    with _lock:
        record = _sessions.get(name) or {}
        record.update({
            "agent": agent,
            "room": room,
            "session_name": name,
            "source": source,
            "session": session,
            "updated_ts": time.time(),
        })
        if model:
            record["model"] = model

        if kind in ("started", "start", "status"):
            status = str(payload.get("status") or "working").lower()
            record["status"] = status
            record["time"] = _iso()
            if payload.get("tool"):
                record["last_tool"] = _clip(payload["tool"], 40)
                record["last_target"] = _clip(payload.get("target") or payload.get("detail") or "", TARGET_MAX)
            _sessions[name] = record
            common.write_event({"type": "terminal_status", **_public(record)})
            return record

        if kind in ("tool", "progress", "activity"):
            tool = _clip(payload.get("tool") or payload.get("name") or "activity", 40)
            detail = _clip(payload.get("target") or payload.get("detail") or "", TARGET_MAX)
            record.update({"status": "working", "last_tool": tool, "last_target": detail, "time": _iso()})
            _sessions[name] = record
            common.write_event({
                "type": "terminal_tool",
                "agent": agent,
                "room": room,
                "session_name": name,
                "tool": tool,
                "detail": detail,
                "source": source,
            })
            return record

        if kind in ("finished", "done", "closed", "error"):
            requested = str(payload.get("status") or "").lower()
            if kind == "closed" or requested == "closed":
                status = "closed"
            elif kind == "error" or requested == "error":
                status = "error"
            else:
                status = "done"
            record.update({"status": status, "time": _iso()})
            _sessions[name] = record
            common.write_event({"type": "terminal_status", **_public(record)})
            return record

        raise ValueError(f"unsupported event: {kind}")


def list_sessions():
    """Sessions shown by GET /api/terminals (active and recently finished)."""
    cutoff = time.time() - KEEP_DONE_S
    with _lock:
        records = [dict(r) for r in _sessions.values()
                   if r.get("status") != "closed" and r.get("updated_ts", 0) >= cutoff]
    return [_public(r) for r in sorted(records, key=lambda r: (r.get("agent", ""), r.get("session_name", "")))]


def reset():
    """Test helper: drop the in-memory session registry."""
    with _lock:
        _sessions.clear()
