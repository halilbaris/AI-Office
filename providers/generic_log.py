"""Passive JSONL log watcher.

Some agent tools write their own session logs. This provider tails the files
listed in watch.json, recognises a few common tool-call shapes and turns them
into office activity. It never rewrites those files and never stores message
text: an unrecognised line becomes a plain "activity" marker.

watch.json (optional):
{
  "watchers": [
    {"id": "codex", "label": "Codex", "path": "~/.codex/sessions", "glob": "**/*.jsonl"}
  ]
}
"""
import glob
import json
import os
import time

import common

from .base import Provider

MAX_AGE_S = 30 * 60
MAX_FILES = 20
MAX_CHUNK = 64 * 1024
DONE_AFTER_S = 60
ACTIVITY_EVERY_S = 5

OFFSETS_FILE = os.path.join(common.STATE_DIR, "watch_offsets.json")


def load_watch_config():
    path = os.environ.get("OFFICE_WATCH_CONFIG") or os.path.join(common.ROOT, "watch.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return []
    watchers = data.get("watchers") if isinstance(data, dict) else None
    return [w for w in (watchers or []) if isinstance(w, dict) and w.get("path")]


def _target(data):
    if not isinstance(data, dict):
        return ""
    for key in ("filePath", "file_path", "path", "command", "pattern", "description",
                "query", "url", "target", "detail", "args"):
        value = data.get(key)
        if value:
            text = " ".join(str(value).split())
            if key == "command":
                text = text.split(" ")[0]
            return text[:80]
    return ""


def _cwd(data):
    if not isinstance(data, dict):
        return None
    for key in ("cwd", "directory", "working_directory", "project", "project_dir"):
        value = data.get(key)
        if isinstance(value, str) and value.startswith(("/", "~")):
            return value
    return None


def _model(data):
    if not isinstance(data, dict):
        return None
    value = data.get("model")
    if isinstance(value, dict):
        value = value.get("id") or value.get("modelID")
    return str(value)[:60] if value else None


def parse_line(line):
    """Return (tool, target, cwd, model) for a recognised tool call, else None."""
    line = (line or "").strip()
    if not line.startswith("{"):
        return None
    try:
        data = json.loads(line)
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None

    cwd, model = _cwd(data), _model(data)

    # Claude Code transcript: assistant message with tool_use blocks.
    message = data.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), list):
        for item in message["content"]:
            if isinstance(item, dict) and item.get("type") == "tool_use":
                return str(item.get("name") or "tool"), _target(item.get("input")), cwd, model

    # OpenCode-style part.
    if data.get("type") == "tool" and data.get("tool"):
        state = data.get("state") if isinstance(data.get("state"), dict) else {}
        return str(data["tool"]), _target(state.get("input")), cwd, model

    # Codex-style response item.
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    if payload.get("type") in ("function_call", "tool_call", "function_call_output"):
        args = payload.get("arguments") or payload.get("input")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except (ValueError, TypeError):
                pass
        return str(payload.get("name") or "tool"), _target(args), cwd, model

    # Generic {tool|name, input|args|target} object.
    name = data.get("tool") or data.get("name")
    if name and any(k in data for k in ("input", "args", "target", "detail")):
        return str(name), _target(data.get("input") or data.get("args") or data), cwd, model

    return None


def _load_offsets():
    try:
        with open(OFFSETS_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_offsets(offsets):
    try:
        os.makedirs(os.path.dirname(OFFSETS_FILE), exist_ok=True)
        tmp = OFFSETS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(offsets, f, indent=1)
        os.replace(tmp, OFFSETS_FILE)
    except OSError:
        pass


class GenericLogProvider(Provider):
    id = "log"
    label = "Log watcher"

    def __init__(self, watchers):
        self.watchers = watchers
        self.offsets = _load_offsets()
        self.files = {}          # path -> {status, last_activity, cwd, model, last_tool, last_target}
        self.dirty = False

    def _paths(self, watcher, now):
        raw = os.path.expanduser(str(watcher.get("path") or ""))
        pattern = str(watcher.get("glob") or "**/*.jsonl")
        if os.path.isfile(raw):
            candidates = [raw]
        elif os.path.isdir(raw):
            candidates = glob.glob(os.path.join(raw, pattern), recursive=True)
        else:
            return []
        found = []
        for path in candidates:
            try:
                mtime = os.path.getmtime(path)
            except OSError:
                continue
            if now - mtime <= MAX_AGE_S:
                found.append((path, mtime))
        found.sort(key=lambda item: item[1], reverse=True)
        return found[: int(watcher.get("max_files") or MAX_FILES)]

    def poll(self):
        now = time.time()
        payloads = []
        for watcher in self.watchers:
            for path, mtime in self._paths(watcher, now):
                try:
                    payloads.extend(self._poll_file(path, mtime, watcher, now))
                except OSError:
                    continue
        if self.dirty:
            self.dirty = False
            _save_offsets(self.offsets)
        return payloads

    def _poll_file(self, path, mtime, watcher, now):
        size = os.path.getsize(path)
        state = self.files.get(path)
        if state is None:
            # First sight: start at the end so a long-existing log is not replayed.
            self.offsets[path] = size
            self.dirty = True
            state = {"status": None, "last_activity": 0.0, "last_tool": None, "last_target": None}
            self.files[path] = state

        offset = int(self.offsets.get(path, 0))
        if size < offset:
            offset = size
            self.offsets[path] = offset
            self.dirty = True

        payloads = []
        label = str(watcher.get("label") or watcher.get("id") or "log")
        session_name = f"{label} \u00b7 {os.path.basename(path)}"
        base = {"source": "log", "session": path, "session_name": session_name,
                "cwd": watcher.get("cwd"), "agent": watcher.get("agent")}

        if size > offset:
            start = max(offset, size - MAX_CHUNK)
            with open(path, "rb") as f:
                f.seek(start)
                chunk = f.read(size - start)
            end = chunk.rfind(b"\n")
            if end < 0:
                return payloads
            complete = chunk[: end + 1]
            self.offsets[path] = start + end + 1
            self.dirty = True

            latest = None
            for raw in complete.decode("utf-8", "replace").splitlines():
                parsed = parse_line(raw)
                if parsed:
                    latest = parsed
                    if parsed[2]:
                        base["cwd"] = parsed[2]
                    if parsed[3]:
                        base["model"] = parsed[3]

            if state["status"] != "working":
                state["status"] = "working"
                payloads.append({**base, "event": "started"})
            state["last_activity"] = now

            if latest:
                tool, target = latest[0], latest[1]
                if (tool, target) != (state["last_tool"], state["last_target"]):
                    state["last_tool"], state["last_target"] = tool, target
                    payloads.append({**base, "event": "tool", "tool": tool, "target": target})
            elif now - state.get("last_activity", 0) >= ACTIVITY_EVERY_S:
                payloads.append({**base, "event": "tool", "tool": "activity", "target": ""})

        if state["status"] == "working" and now - mtime > DONE_AFTER_S:
            state["status"] = "done"
            payloads.append({**base, "event": "finished"})

        return payloads
