"""Read-only OpenCode watcher.

OpenCode has two local schemas:
  - v2 (desktop and current CLI): session_v2 + session_message, tool calls inside
    message["content"] as {"type":"tool","name":...,"state":{"input":...}}
  - v1 (older CLI): session + part, tool parts as {"type":"tool","tool":...}

We prefer v2 when it exists and only read recent sessions. Nothing is written
back. Set OFFICE_OPENCODE_DB to point at a different database.
"""
import json
import os
import sqlite3
import time

from .base import Provider

DB = os.environ.get("OFFICE_OPENCODE_DB") or os.path.expanduser(
    "~/.local/share/opencode/opencode.db")
ACTIVE_S = 45
RECENT_MS = 10 * 60 * 1000
MAX_SESSIONS = 20
MAX_MESSAGES = 8


def _target(data):
    if not isinstance(data, dict):
        return ""
    for key in ("filePath", "file_path", "path", "command", "pattern", "description",
                "query", "url", "target", "detail"):
        value = data.get(key)
        if value:
            text = " ".join(str(value).split())
            if key == "command":
                text = text.split(" ")[0]
            return text[:80]
    return ""


def tool_from_part(data):
    """(tool, target) from a v1 part payload, or None."""
    if not isinstance(data, dict) or data.get("type") != "tool":
        return None
    tool = str(data.get("tool") or "").strip()
    if not tool:
        return None
    state = data.get("state") if isinstance(data.get("state"), dict) else {}
    return tool, _target(state.get("input"))


def tool_from_message(data):
    """(id, tool, target) for the newest tool item in a v2 message, or None."""
    if not isinstance(data, dict):
        return None
    content = data.get("content")
    if not isinstance(content, list):
        return None
    found = None
    for index, item in enumerate(content):
        if not isinstance(item, dict) or item.get("type") != "tool":
            continue
        tool = str(item.get("name") or "").strip()
        if not tool:
            continue
        state = item.get("state") if isinstance(item.get("state"), dict) else {}
        found = (str(item.get("id") or index), tool, _target(state.get("input")))
    return found


def model_name(raw):
    try:
        data = json.loads(raw) if isinstance(raw, str) else (raw or {})
        value = data.get("id") or data.get("modelID")
        return str(value)[:60] if value else None
    except (ValueError, TypeError):
        return str(raw)[:60] if raw else None


class OpenCodeProvider(Provider):
    id = "opencode"
    label = "OpenCode"

    def __init__(self):
        self.db = DB
        self.seen_part = {}
        self.status = {}

    def _schema(self, connection):
        try:
            tables = {row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
        except sqlite3.Error:
            return None
        if {"session_v2", "session_message"} <= tables:
            return "v2"
        if {"session", "part"} <= tables:
            return "v1"
        return None

    def poll(self):
        if not os.path.exists(self.db):
            return []
        try:
            connection = sqlite3.connect(f"file:{self.db}?mode=ro", uri=True, timeout=1.0)
        except sqlite3.Error:
            return []
        connection.row_factory = sqlite3.Row
        try:
            schema = self._schema(connection)
            if schema == "v2":
                return self._poll_v2(connection)
            if schema == "v1":
                return self._poll_v1(connection)
            return []
        except sqlite3.Error:
            return []
        finally:
            connection.close()

    def _base(self, session_id, directory, title, model):
        title = str(title or "").strip()
        if not title:
            title = os.path.basename(str(directory or "")) or session_id[:8]
        return {
            "source": "opencode",
            "session": session_id,
            "session_name": f"OpenCode \u00b7 {title}",
            "cwd": directory,
            "model": model_name(model),
        }

    def _remember(self, session_id, active, base, payloads, tool=None):
        if active and self.status.get(session_id) != "working":
            self.status[session_id] = "working"
            payloads.append({**base, "event": "started"})
        if tool and self.seen_part.get(session_id) != tool[0]:
            self.seen_part[session_id] = tool[0]
            payloads.append({**base, "event": "tool", "tool": tool[1], "target": tool[2]})
        if not active and self.status.get(session_id) == "working":
            self.status[session_id] = "done"
            payloads.append({**base, "event": "finished"})

    def _poll_v2(self, connection):
        now_ms = int(time.time() * 1000)
        rows = connection.execute(
            "SELECT id, directory, title, time_updated, model, parent_id "
            "FROM session_v2 WHERE time_updated >= ? ORDER BY time_updated DESC LIMIT ?",
            (now_ms - RECENT_MS, MAX_SESSIONS)).fetchall()
        payloads = []
        for row in rows:
            if row["parent_id"]:
                continue
            session_id = row["id"]
            active = now_ms - int(row["time_updated"] or 0) < ACTIVE_S * 1000
            base = self._base(session_id, row["directory"], row["title"], row["model"])
            tool = None
            messages = connection.execute(
                "SELECT id, data FROM session_message WHERE session_id = ? "
                "ORDER BY time_created DESC LIMIT ?",
                (session_id, MAX_MESSAGES)).fetchall()
            for message in messages:
                try:
                    data = json.loads(message["data"])
                except (ValueError, TypeError):
                    continue
                found = tool_from_message(data)
                if found:
                    tool = found
                    break
            self._remember(session_id, active, base, payloads, tool)
        return payloads

    def _poll_v1(self, connection):
        now_ms = int(time.time() * 1000)
        rows = connection.execute(
            "SELECT id, directory, title, time_updated, model, parent_id "
            "FROM session WHERE time_updated >= ? ORDER BY time_updated DESC LIMIT ?",
            (now_ms - RECENT_MS, MAX_SESSIONS)).fetchall()
        payloads = []
        for row in rows:
            if row["parent_id"]:
                continue
            session_id = row["id"]
            active = now_ms - int(row["time_updated"] or 0) < ACTIVE_S * 1000
            base = self._base(session_id, row["directory"], row["title"], row["model"])
            tool = None
            parts = connection.execute(
                "SELECT id, data FROM part WHERE session_id = ? "
                "ORDER BY time_created DESC LIMIT ?",
                (session_id, MAX_MESSAGES)).fetchall()
            for part in parts:
                try:
                    data = json.loads(part["data"])
                except (ValueError, TypeError):
                    continue
                found = tool_from_part(data)
                if found:
                    tool = (part["id"], found[0], found[1])
                    break
            self._remember(session_id, active, base, payloads, tool)
        return payloads
