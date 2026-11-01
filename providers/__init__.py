"""External activity providers and the watch manager."""
from .base import Provider
from .generic_log import GenericLogProvider, load_watch_config
from .opencode import OpenCodeProvider

__all__ = ["Provider", "OpenCodeProvider", "GenericLogProvider", "load_watch_config"]
