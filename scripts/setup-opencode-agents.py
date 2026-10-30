#!/usr/bin/env python3
"""Adds the MyOffice agents to the global OpenCode config.

OpenCode decides which tools an agent may use per agent, so the office asks for one of four agents instead of
relying on its own tool list:

  office-read    read, grep, glob            (no shell, no editor)
  office-review  the above + shell           (git and friends, no editor)
  office-browse  the above + web fetch       (research)
  office-write   everything                  (build / deploy agents)

Usage: python3 scripts/setup-opencode-agents.py [--dry-run]
Idempotent: existing entries are replaced, the previous file is kept as opencode.json.bak-<timestamp>.
"""
import json
import os
import shutil
import sys
import time

CONFIG = os.path.expanduser("~/.config/opencode/opencode.json")

AGENTS = {
    "office-read": {
        "description": "MyOffice read-only agent: reads and searches, cannot run commands or write",
        "mode": "primary",
        "tools": {"*": False, "read": True, "grep": True, "glob": True},
    },
    "office-review": {
        "description": "MyOffice reviewer: reads, searches and runs shell commands, cannot edit files",
        "mode": "primary",
        "tools": {"*": False, "read": True, "grep": True, "glob": True, "bash": True},
    },
    "office-browse": {
        "description": "MyOffice researcher: reads, searches and fetches the web",
        "mode": "primary",
        "tools": {"*": False, "read": True, "grep": True, "glob": True, "webfetch": True},
    },
    "office-write": {
        "description": "MyOffice builder: full working set (read, search, shell, edit, web)",
        "mode": "primary",
        "tools": {"*": True},
    },
}


def main():
    dry = "--dry-run" in sys.argv
    os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
    data = {}
    if os.path.exists(CONFIG):
        try:
            with open(CONFIG, encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            sys.exit(f"{CONFIG} is not valid JSON: {e}")
        if not dry:
            backup = f"{CONFIG}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
            shutil.copy2(CONFIG, backup)
            print(f"backup: {backup}")
    data.setdefault("agent", {}).update(AGENTS)
    if dry:
        print(json.dumps({"agent": AGENTS}, indent=1))
        return
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"wrote {CONFIG} with agents: {', '.join(AGENTS)}")
    print("OpenCode picks this up on its next run; `opencode reload` also works for a running server.")


if __name__ == "__main__":
    main()
