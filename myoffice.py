#!/usr/bin/env python3
"""MyOffice command line.

    myoffice run -- <any agent command...>   run a CLI and show it in the office
    myoffice hook --tool read --target x.py  send one event from a tool hook

The wrapper never changes the command's arguments or working directory. It
tees the output to the terminal and sends only tool names and short targets to
the local office.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import common  # noqa: E402
from providers.generic_log import parse_line  # noqa: E402

ACTIVITY_EVERY_S = 2.0


def office_url():
    configured = os.environ.get("OFFICE_URL")
    if configured:
        return configured.rstrip("/")
    port = os.environ.get("OFFICE_PORT")
    if not port:
        try:
            with open(os.path.join(ROOT, "port"), encoding="utf-8") as handle:
                port = handle.read().strip()
        except OSError:
            port = "8796"
    return f"http://127.0.0.1:{port}"


def post(payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{office_url()}/api/ingest",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=1.5) as response:
            response.read()
        return True
    except Exception:
        return False


def detect_model(command, env):
    for index, arg in enumerate(command):
        if arg in ("--model", "-m") and index + 1 < len(command):
            return command[index + 1]
        if arg.startswith("--model="):
            return arg.split("=", 1)[1]
    for key in ("ANTHROPIC_MODEL", "OPENAI_MODEL", "GEMINI_MODEL", "OLLAMA_MODEL", "OPENCODE_MODEL"):
        if env.get(key):
            return env[key]
    return None


def run_command(argv):
    own, command = [], list(argv)
    if "--" in command:
        split = command.index("--")
        own, command = command[:split], command[split + 1:]
    parser = argparse.ArgumentParser(prog="myoffice run")
    parser.add_argument("--agent")
    parser.add_argument("--session")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(own)
    if not command:
        parser.error("a command is required: myoffice run -- <command...>")

    session = args.session or uuid.uuid4().hex[:8]
    base = {
        "source": "wrapper",
        "session": session,
        "session_name": f"{os.path.basename(command[0])} \u00b7 {session[:6]}",
        "cwd": os.getcwd(),
        "agent": args.agent,
        "model": detect_model(command, os.environ),
    }
    warned = False

    def send(payload):
        nonlocal warned
        merged = {key: value for key, value in {**base, **payload}.items() if value is not None}
        if not post(merged) and not warned:
            warned = True
            sys.stderr.write("MyOffice is not running; events are not shown.\n")

    send({"event": "started"})
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except OSError as exc:
        send({"event": "finished", "status": "error"})
        sys.stderr.write(f"myoffice: {exc}\n")
        return 127

    last_activity = 0.0
    code = 0
    try:
        for line in process.stdout:
            if not args.quiet:
                sys.stdout.write(line)
                sys.stdout.flush()
            parsed = parse_line(line)
            now = time.time()
            if parsed:
                send({"event": "tool", "tool": parsed[0], "target": parsed[1],
                      "cwd": parsed[2] or base["cwd"], "model": parsed[3] or base.get("model")})
                last_activity = now
            elif now - last_activity >= ACTIVITY_EVERY_S:
                send({"event": "tool", "tool": "activity"})
                last_activity = now
        code = process.wait()
    except KeyboardInterrupt:
        process.terminate()
        code = process.wait()
    finally:
        send({"event": "finished", "status": "done" if code == 0 else "error",
              "exit_code": code})
    return code


def send_hook(argv):
    parser = argparse.ArgumentParser(prog="myoffice hook")
    parser.add_argument("--event", default="tool")
    parser.add_argument("--agent")
    parser.add_argument("--session")
    parser.add_argument("--session-name")
    parser.add_argument("--tool")
    parser.add_argument("--target")
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument("--model")
    parser.add_argument("--status")
    args = parser.parse_args(argv)
    payload = {
        "source": "hook",
        "event": args.event,
        "agent": args.agent,
        "session": args.session or uuid.uuid4().hex[:8],
        "session_name": args.session_name,
        "tool": args.tool,
        "target": args.target,
        "cwd": args.cwd,
        "model": args.model,
        "status": args.status,
    }
    payload = {key: value for key, value in payload.items() if value is not None}
    if not post(payload):
        sys.stderr.write("MyOffice is not running.\n")
        return 1
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__.strip())
        return 0
    if argv[0] == "run":
        return run_command(argv[1:])
    if argv[0] == "hook":
        return send_hook(argv[1:])
    sys.stderr.write(f"unknown command: {argv[0]}\nTry: myoffice run -- <command>\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
