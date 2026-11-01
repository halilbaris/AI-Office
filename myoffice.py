#!/usr/bin/env python3
"""MyOffice command line.

    myoffice init                            create the private config on first run
    myoffice start                           start the local server and open it
    myoffice run -- <any agent command...>   run a CLI and show it in the office
    myoffice hook --tool read --target x.py  send one event from a tool hook

The wrapper never changes the command's arguments or working directory. It
tees the output to the terminal and sends only tool names and short targets to
the local office.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import uuid
import webbrowser

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


def _which(name):
    found = shutil.which(name)
    if found:
        return found
    for candidate in (os.path.expanduser(f"~/.opencode/bin/{name}"),
                      os.path.expanduser(f"~/.local/bin/{name}")):
        if os.path.exists(candidate):
            return candidate
    return None


def _running_url(port_file):
    try:
        with open(port_file, encoding="utf-8") as handle:
            port = handle.read().strip()
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/agents", timeout=1.0) as response:
            response.read()
        return f"http://127.0.0.1:{port}"
    except Exception:
        return None


def _open_browser(url):
    try:
        webbrowser.open(url)
    except Exception:
        pass


def init_project(_argv):
    os.makedirs(os.path.dirname(common.AGENTS_FILE) or ".", exist_ok=True)
    created = []
    if not os.path.exists(common.AGENTS_FILE):
        shutil.copyfile(os.path.join(ROOT, "agents.example.json"), common.AGENTS_FILE)
        created.append(os.path.basename(common.AGENTS_FILE))
    bridge_file = os.path.join(ROOT, "bridge.json")
    if not os.path.exists(bridge_file):
        with open(bridge_file, "w", encoding="utf-8") as handle:
            json.dump({"cwd": {}, "window": {}, "default": "engineer",
                       "skip_cwd": [], "hide": []}, handle, indent=2)
            handle.write("\n")
        created.append("bridge.json")
    for directory in (common.STATE_DIR, common.RUNS_DIR, common.OUTPUT_DIR, common.MEMORY_DIR):
        os.makedirs(directory, exist_ok=True)

    print("MyOffice is ready.")
    print(f"  config: {common.AGENTS_FILE}")
    for name in ("claude", "opencode", "codex", "gemini", "tmux"):
        path = _which(name)
        print(f"  {'ok' if path else '--'} {name}: {path or 'not found'}")
    if created:
        print("  created: " + ", ".join(created))
    print("Next: set each agent's cwd and model in agents.json, or in Settings -> Agents.")
    print("Start: myoffice start")
    return 0


def start_server(argv):
    parser = argparse.ArgumentParser(prog="myoffice start")
    parser.add_argument("--no-browser", action="store_true",
                        help="do not open the office in a browser")
    args = parser.parse_args(argv)
    if not os.path.exists(common.AGENTS_FILE):
        init_project([])
    port_file = os.path.join(ROOT, "port")
    url = _running_url(port_file)
    if url:
        print(f"MyOffice is already running: {url}")
        if not args.no_browser:
            _open_browser(url)
        return 0

    log_path = os.path.join(ROOT, "server.log")
    with open(log_path, "ab") as log:
        process = subprocess.Popen(
            [sys.executable, os.path.join(ROOT, "server.py")],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    for _ in range(50):
        time.sleep(0.3)
        url = _running_url(port_file)
        if url:
            print(f"MyOffice is running: {url}")
            print(f"Stop it with: kill {process.pid}")
            if not args.no_browser:
                _open_browser(url)
            return 0
        if process.poll() is not None:
            break
    print(f"MyOffice did not start. See {log_path}.")
    return 1


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__.strip())
        return 0
    if argv[0] == "init":
        return init_project(argv[1:])
    if argv[0] == "start":
        return start_server(argv[1:])
    if argv[0] == "run":
        return run_command(argv[1:])
    if argv[0] == "hook":
        return send_hook(argv[1:])
    sys.stderr.write(f"unknown command: {argv[0]}\nTry: myoffice init | myoffice start | myoffice run -- <command>\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
