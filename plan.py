"""Plan: schedules (run an agent at set times) and the backlog (work waiting to be started).

Stored in state/plan.json (gitignored). Nothing here calls a model. The server's scheduler thread only *starts*
runs through the normal start_task, so the daily cap, the busy check, review gates and the "never ship" rule all
apply. A schedule can never ship; a backlog item only starts when you press Run.
"""
import fcntl
import json
import os
import re
import secrets
from datetime import datetime, timedelta

import common

PLAN_FILE = os.path.join(common.STATE_DIR, "plan.json")
MAX_SCHEDULES, MAX_TASKS = 30, 100
GRACE_MIN = 15          # a schedule fires up to 15 minutes late (server was busy); later than that it counts as missed
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class PlanError(Exception):
    def __init__(self, message, code=400):
        super().__init__(message)
        self.code = code


def _empty():
    return {"schedules": [], "tasks": []}


def load():
    try:
        with open(PLAN_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return _empty()
    if not isinstance(data, dict):
        return _empty()
    return {"schedules": [s for s in data.get("schedules", []) if isinstance(s, dict)],
            "tasks": [t for t in data.get("tasks", []) if isinstance(t, dict)]}


def save(data):
    os.makedirs(common.STATE_DIR, exist_ok=True)
    tmp = PLAN_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, PLAN_FILE)


class locked:
    """Cross-process lock around read-modify-write of the plan (UI actions and the scheduler thread)."""
    def __enter__(self):
        os.makedirs(common.STATE_DIR, exist_ok=True)
        self.f = open(os.path.join(common.STATE_DIR, "plan.lock"), "a")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def _text(value, name, limit, required=True):
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > limit:
        raise PlanError(f"{name} must be text of at most {limit} characters" + (" and not empty" if required else ""))
    return value.strip()


def _agent(value, table):
    if not isinstance(value, str) or value not in table or value == "ceo":
        raise PlanError("choose one of the agents (not the CEO)")
    return value


def _when(value):
    if not isinstance(value, dict):
        raise PlanError("when is required")
    time = value.get("time")
    days = value.get("days")
    if not isinstance(time, str) or not TIME_RE.match(time):
        raise PlanError("time must look like 09:30")
    if not isinstance(days, list) or not days or not all(isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6 for d in days):
        raise PlanError("pick at least one day")
    return {"time": time, "days": sorted(set(days))}


def describe(when):
    days = when["days"]
    names = ("every day" if len(days) == 7 else "weekdays" if days == [0, 1, 2, 3, 4] else
             "weekends" if days == [5, 6] else ", ".join(DAY_NAMES[d] for d in days))
    return f"{names} at {when['time']}"


def apply(action, payload, table):
    """One UI action. Returns the changed plan. Raises PlanError on anything invalid."""
    with locked():
        plan = load()
        if action == "add_schedule":
            if len(plan["schedules"]) >= MAX_SCHEDULES:
                raise PlanError(f"at most {MAX_SCHEDULES} schedules")
            plan["schedules"].append({
                "id": "s-" + secrets.token_hex(3), "agent": _agent(payload.get("agent"), table),
                "label": _text(payload.get("label"), "name", 80), "prompt": _text(payload.get("prompt"), "task", common.MAX_INPUT),
                "when": _when(payload.get("when")), "enabled": True, "created": common.now_iso()})
        elif action in ("toggle_schedule", "delete_schedule"):
            item = next((s for s in plan["schedules"] if s.get("id") == payload.get("id")), None)
            if not item:
                raise PlanError("schedule not found", 404)
            if action == "delete_schedule":
                plan["schedules"].remove(item)
            else:
                item["enabled"] = not item.get("enabled", True)
        elif action == "add_task":
            if len(plan["tasks"]) >= MAX_TASKS:
                raise PlanError(f"at most {MAX_TASKS} planned items")
            plan["tasks"].append({
                "id": "t-" + secrets.token_hex(3), "title": _text(payload.get("title"), "title", 80),
                "agent": _agent(payload.get("agent") or "coder", table),
                "prompt": _text(payload.get("prompt") or payload.get("title"), "details", common.MAX_INPUT),
                "created": common.now_iso()})
        elif action == "delete_task":
            item = next((t for t in plan["tasks"] if t.get("id") == payload.get("id")), None)
            if not item:
                raise PlanError("planned item not found", 404)
            plan["tasks"].remove(item)
        else:
            raise PlanError("unknown action")
        save(plan)
        return plan


def due(plan, now):
    """Schedules that should fire now: today's time has passed, within the grace window, not fired today yet.
    Returns (to_fire, missed): `missed` are schedules whose time passed more than GRACE_MIN ago without a run."""
    fire, missed = [], []
    today = now.strftime("%Y-%m-%d")
    for s in plan["schedules"]:
        if not s.get("enabled", True) or s.get("last_fired_date") == today:
            continue
        w = s.get("when") or {}
        if now.weekday() not in (w.get("days") or []) or not TIME_RE.match(str(w.get("time"))):
            continue
        hh, mm = map(int, w["time"].split(":"))
        at = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if now < at:
            continue
        created = s.get("created") or ""
        try:
            if datetime.fromisoformat(created).replace(tzinfo=None) > at:     # created after today's slot: wait for the next one
                continue
        except ValueError:
            pass
        (fire if now - at <= timedelta(minutes=GRACE_MIN) else missed).append(s)
    return fire, missed


def mark(schedule_id, **fields):
    with locked():
        plan = load()
        for s in plan["schedules"]:
            if s.get("id") == schedule_id:
                s.update(fields)
        save(plan)
