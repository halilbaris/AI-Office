"""Base class for external activity providers.

A provider is a read-only poller. It returns ingest payloads; the watch
manager normalises and writes them through ingest.handle(). No provider writes
to another tool's storage.
"""


class Provider:
    id = "base"
    label = "Base"

    def poll(self):
        """Return a list of ingest payload dicts seen since the last call."""
        return []

    def close(self):
        pass
