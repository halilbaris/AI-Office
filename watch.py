"""Poll external activity providers and feed ingest.

The Claude bridge keeps its own loop because it also tracks transcripts and
tmux. This manager is for the tool-agnostic sources: OpenCode's local database
and any JSONL logs listed in watch.json.
"""
import os
import threading
import time

import common
import ingest
from providers.generic_log import GenericLogProvider, load_watch_config
from providers.opencode import DB as OPENCODE_DB
from providers.opencode import OpenCodeProvider

ERROR_COOLDOWN_S = 300


class WatchManager:
    def __init__(self):
        self.providers = []
        if os.path.exists(OPENCODE_DB):
            self.providers.append(OpenCodeProvider())
        watchers = load_watch_config()
        if watchers:
            self.providers.append(GenericLogProvider(watchers))
        self.stop_event = threading.Event()
        self.last_error = {}

    @property
    def ids(self):
        return [provider.id for provider in self.providers]

    def start(self):
        if self.providers:
            threading.Thread(target=self.loop, name="external-watch", daemon=True).start()

    def cycle(self):
        for provider in self.providers:
            try:
                for payload in provider.poll():
                    ingest.handle(payload)
            except Exception as exc:  # a provider failure never takes the office down
                now = time.time()
                if now - self.last_error.get(provider.id, 0) >= ERROR_COOLDOWN_S:
                    self.last_error[provider.id] = now
                    common.write_event({"type": "error", "agent": "ceo",
                                        "detail": f"{provider.id} watch: {type(exc).__name__}"})

    def loop(self):
        while not self.stop_event.wait(2.0):
            self.cycle()

    def close(self):
        self.stop_event.set()
        for provider in self.providers:
            provider.close()


def start():
    manager = WatchManager()
    manager.start()
    return manager
