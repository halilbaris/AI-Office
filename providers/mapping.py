"""Shared cwd -> office-agent mapping for external providers.

The Claude bridge has its own copy of this logic because it also matches tmux
window names. External sessions (OpenCode, logs, wrappers) only have a working
directory, so they use the cwd/default part of bridge.json.
"""
import json
import os

import common

MAP_FILE = os.path.join(common.ROOT, "bridge.json")


def load_mapping():
    try:
        with open(MAP_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _nearest(table, path):
    """The most specific parent mapping for a path, or None."""
    if not isinstance(table, dict) or not path:
        return None
    path = os.path.normpath(os.path.expanduser(str(path)))
    best = None
    for raw, value in table.items():
        base = os.path.normpath(os.path.expanduser(str(raw)))
        if path == base or path.startswith(base + os.sep):
            if best is None or len(base) > len(best[0]):
                best = (base, value)
    return best[1] if best else None


def resolve(cwd, agents=None):
    """Return (agent_id, room) for a working directory, or (None, None).

    Order: hide/skip_cwd -> nearest cwd mapping -> default -> first non-CEO
    agent. The bridge uses the first non-CEO fallback only for interactive
    sessions; external sources are always interactive, so it applies here too.
    """
    mapping = load_mapping()
    normalised = os.path.normpath(os.path.expanduser(str(cwd))) if cwd else ""

    for needle in mapping.get("hide") or []:
        if needle and str(needle) in normalised:
            return None, None
    skip = {os.path.normpath(os.path.expanduser(str(x))) for x in (mapping.get("skip_cwd") or [])}
    if normalised and normalised in skip:
        return None, None

    if agents is None:
        try:
            _, agents = common.load_agents()
        except (common.ConfigError, ValueError, json.JSONDecodeError):
            return None, None

    agent = _nearest(mapping.get("cwd") or {}, normalised)
    if agent == "ceo":
        agent = None
    if not agent:
        agent = mapping.get("default")
    if not agent:
        agent = next((a for a in agents if a != "ceo"), None)

    if not isinstance(agent, str) or agent == "ceo" or agent not in agents:
        return None, None
    return agent, agents[agent].get("room") or "general"
