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
MAX_SCHEDULES, MAX_TASKS, MAX_PROJECTS, MAX_STEPS = 30, 100, 20, 12
STEP_ID_RE = re.compile(r"^[a-z0-9]{1,6}$")
HOLD_VERDICTS = ("BLOCKED", "CHANGES NEEDED")      # a reviewer verdict that stops the next step until you decide
GRACE_MIN = 15          # a schedule fires up to 15 minutes late (server was busy); later than that it counts as missed
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class PlanError(Exception):
    def __init__(self, message, code=400):
        super().__init__(message)
        self.code = code


def _empty():
    return {"schedules": [], "tasks": [], "projects": []}


def load():
    try:
        with open(PLAN_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return _empty()
    if not isinstance(data, dict):
        return _empty()
    return {"schedules": [s for s in data.get("schedules", []) if isinstance(s, dict)],
            "tasks": [t for t in data.get("tasks", []) if isinstance(t, dict)],
            "projects": [x for x in data.get("projects", []) if isinstance(x, dict)]}


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
        elif action in ("delete_project", "set_auto", "retry_step", "accept_step"):
            project = next((x for x in plan["projects"] if x.get("id") == payload.get("id")), None)
            if not project:
                raise PlanError("project not found", 404)
            if action == "delete_project":
                plan["projects"].remove(project)
            elif action == "set_auto":
                project["auto"] = payload.get("auto") is True
            else:
                step = next((s for s in project["steps"] if s.get("id") == payload.get("step")), None)
                if not step:
                    raise PlanError("step not found", 404)
                if action == "accept_step":
                    step["accepted"] = True          # you looked at the reviewer's remarks and let the project go on
                else:
                    for key in ("run_id", "started", "accepted"):
                        step.pop(key, None)
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


# ---------- projects: a big job split into steps ----------

def make_project(raw, table, request=""):
    """Validates a project the CEO proposed: 2..12 steps, each with a real agent; `after` names an earlier step."""
    if not isinstance(raw, dict) or not isinstance(raw.get("steps"), list):
        raise PlanError("project needs a title and steps")
    steps, seen, names = [], [], {}
    if not 2 <= len(raw["steps"]) <= MAX_STEPS:
        raise PlanError(f"a project has 2 to {MAX_STEPS} steps")
    for i, st in enumerate(raw["steps"]):
        if not isinstance(st, dict):
            raise PlanError("broken step")
        # models write ids like "step_1" or "Research": keep what is usable, fall back to the position
        original = str(st.get("id") if st.get("id") is not None else i + 1)
        sid = re.sub(r"[^a-z0-9]", "", original.lower())[:6] or f"s{i + 1}"
        while sid in seen:
            sid = f"s{i + 1}x{len(seen)}"[:6]
        names[original] = names[str(i + 1)] = names[original.lower()] = sid
        raw_after = st.get("after")
        if isinstance(raw_after, str) and raw_after.strip().lower() in ("none", "start", "parallel"):
            after = None                                  # explicitly independent: starts with the project
        elif raw_after in (None, "", []):
            after = seen[-1] if seen else None            # default: one step after the other, each gets the one before
        else:
            after = names.get(str(raw_after)) or names.get(str(raw_after).lower())
            if after is None:
                raise PlanError(f"step {i + 1}: 'after' must name an earlier step")
        steps.append({"id": sid, "agent": _agent(st.get("agent"), table), "title": _text(st.get("title"), "step title", 80),
                      "prompt": _text(st.get("prompt"), "step task", common.MAX_INPUT), "after": after})
        seen.append(sid)
    return {"id": "p-" + secrets.token_hex(3), "title": _text(raw.get("title"), "project title", 80),
            "request": str(request or "")[:1000], "created": common.now_iso(), "auto": False, "steps": steps}


def add_project(raw, table, request=""):
    with locked():
        data = load()
        if len(data["projects"]) >= MAX_PROJECTS:
            raise PlanError(f"at most {MAX_PROJECTS} projects; delete an old one first")
        project = make_project(raw, table, request)
        data["projects"].append(project)
        save(data)
        return project


def ready_steps(project, statuses):
    """Steps that can start now: not started, and the step they wait for is done (reviewed, not on hold)."""
    out = []
    for st in project["steps"]:
        if st.get("run_id"):
            continue
        if st.get("after") is None or statuses.get(st["after"]) == "done":
            out.append(st)
    return out


def project_summary(project, statuses):
    done = sum(1 for s in project["steps"] if statuses.get(s["id"]) == "done")
    return {"done": done, "total": len(project["steps"]), "complete": done == len(project["steps"])}
