"""Sense API client scaffold.

This module will host the Python port of the Home Assistant integration logic.
"""

from dataclasses import dataclass
from typing import Any


@dataclass
class SenseCredentials:
    username: str
    password: str


class SenseClient:
    """Minimal client shell for future API implementation."""

    def __init__(self, creds: SenseCredentials) -> None:
        self._creds = creds

    def fetch_realtime(self) -> dict[str, Any]:
        """Return latest power metrics.

        TODO: Implement real API calls once HA source code mapping is complete.
        """
        return {
            "watts": 0.0,
            "kwh_total": 0.0,
        }
