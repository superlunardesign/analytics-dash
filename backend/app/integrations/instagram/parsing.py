"""Turns raw Instagram Graph API payloads into flat dicts matching
PostMetricSnapshot columns."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

_SIMPLE_METRIC_MAP = {
    "views": "views",
    "reach": "reach",
    "likes": "likes",
    "comments": "comments",
    "saved": "saves",
    "shares": "shares",
    "total_interactions": "total_interactions",
    "ig_reels_avg_watch_time": "avg_watch_time_sec",
    "ig_reels_video_view_total_time": "total_watch_time_sec",
    "follows": "follows",
    "profile_visits": "profile_visits",
}

# Keys observed inside the profile_activity `action_type` breakdown that
# represent a bio-link tap. Meta has used slightly different key casing
# across API versions, so we match a few known variants.
_BIO_LINK_ACTION_KEYS = {"bio_link_clicked", "BIO_LINK_CLICKED", "bio_link"}


def _extract_simple_value(entry: dict[str, Any]) -> Any:
    values = entry.get("values") or []
    if values and isinstance(values[0], dict) and "value" in values[0]:
        return values[0]["value"]
    total_value = entry.get("total_value")
    if isinstance(total_value, dict) and "value" in total_value:
        return total_value["value"]
    return None


def _extract_breakdown(entry: dict[str, Any]) -> dict[str, int]:
    """Flattens the `total_value.breakdowns[].results[]` shape used by
    metrics requested with a `breakdown` param (e.g. profile_activity)."""
    out: dict[str, int] = {}
    total_value = entry.get("total_value") or {}
    for breakdown in total_value.get("breakdowns", []):
        for result in breakdown.get("results", []):
            dims = result.get("dimension_values") or []
            key = dims[0] if dims else "unknown"
            out[key] = result.get("value", 0)
    return out


def parse_media_insights(raw: dict[str, Any]) -> dict[str, Any]:
    """Returns a dict of PostMetricSnapshot-shaped fields plus an
    `other_metrics` bucket for anything not mapped to a fixed column."""

    fields: dict[str, Any] = {}
    other_metrics: dict[str, Any] = {}
    profile_activity_breakdown: dict[str, int] = {}

    for entry in raw.get("data", []):
        name = entry.get("name")
        if name == "profile_activity":
            profile_activity_breakdown.update(_extract_breakdown(entry))
            continue
        if name == "navigation":
            other_metrics["navigation"] = _extract_breakdown(entry) or _extract_simple_value(entry)
            continue
        if name in _SIMPLE_METRIC_MAP:
            fields[_SIMPLE_METRIC_MAP[name]] = _extract_simple_value(entry)
        elif name:
            other_metrics[name] = _extract_simple_value(entry)

    if profile_activity_breakdown:
        other_metrics["profile_activity"] = profile_activity_breakdown
        bio_taps = sum(v for k, v in profile_activity_breakdown.items() if k in _BIO_LINK_ACTION_KEYS)
        fields["bio_link_taps"] = bio_taps

    fields["other_metrics"] = other_metrics
    return fields


def parse_media_timestamp(raw_timestamp: str | None) -> datetime | None:
    if not raw_timestamp:
        return None
    # Instagram returns ISO 8601 with a timezone offset, e.g. 2026-01-05T14:30:00+0000
    try:
        return datetime.strptime(raw_timestamp, "%Y-%m-%dT%H:%M:%S%z").astimezone(timezone.utc)
    except ValueError:
        return datetime.fromisoformat(raw_timestamp)
