"""Normalized data models for Sense payloads."""

from dataclasses import dataclass


@dataclass
class PowerSnapshot:
    watts: float
    kwh_total: float
