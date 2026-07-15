"""Thin wrapper around the Instagram Graph API (graph.instagram.com).

Metric names here are Meta's current (2026) set and have shifted multiple
times over the last two years (Jan/Mar/Apr 2025, Dec 2025 waves of
deprecations). If a sync run starts failing with an "Invalid metric"
error, this is the first place to check against
https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import get_settings

GRAPH_BASE_URL = "https://graph.instagram.com"

MEDIA_FIELDS = [
    "id",
    "caption",
    "media_type",
    "media_product_type",
    "permalink",
    "thumbnail_url",
    "media_url",
    "timestamp",
    "like_count",
    "comments_count",
]

# Metrics common to feed posts and reels.
_COMMON_METRICS = ["reach", "saved", "shares", "total_interactions", "likes", "comments", "views"]
# Reels-only.
_REELS_METRICS = ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]
# Feed/Reels: per-post breakdown of profile taps attributed to this post
# (includes bio link clicks). Not available for stories.
_PROFILE_ACTIVITY_METRIC = "profile_activity"

STORY_METRICS = ["reach", "shares", "views", "replies", "navigation"]
# Attempted opportunistically for FEED/REELS; not all are guaranteed
# available for every account tier, so each is requested individually and
# silently dropped if the API rejects it (see get_media_insights).
_OPTIONAL_METRICS = ["follows", "profile_visits"]


class InstagramAPIError(RuntimeError):
    def __init__(self, message: str, payload: dict | None = None):
        super().__init__(message)
        self.payload = payload or {}


@dataclass
class InstagramClient:
    access_token: str
    graph_api_version: str = field(default_factory=lambda: get_settings().meta_graph_api_version)

    def _get(self, path: str, params: dict | None = None) -> dict:
        params = dict(params or {})
        params["access_token"] = self.access_token
        url = f"{GRAPH_BASE_URL}/{path}"
        resp = httpx.get(url, params=params, timeout=30)
        if resp.status_code >= 400:
            raise InstagramAPIError(f"Instagram API error on {path}: {resp.text}", payload=resp.json() if resp.content else None)
        return resp.json()

    def get_profile(self) -> dict:
        return self._get("me", {"fields": "user_id,username,name,account_type"})

    def list_media(self, after: str | None = None, limit: int = 50) -> dict:
        """One page of the account's media, newest first. Returns the raw
        Graph API response including `paging.cursors.after` for pagination."""
        params: dict[str, Any] = {"fields": ",".join(MEDIA_FIELDS), "limit": limit}
        if after:
            params["after"] = after
        return self._get("me/media", params)

    def iter_all_media(self) -> list[dict]:
        items: list[dict] = []
        after = None
        while True:
            page = self.list_media(after=after)
            items.extend(page.get("data", []))
            after = page.get("paging", {}).get("cursors", {}).get("after")
            if not after or not page.get("paging", {}).get("next"):
                break
        return items

    def get_media_insights(self, media_id: str, media_product_type: str | None) -> dict:
        """Fetch insights for one media item. Metric set depends on
        media_product_type (FEED, REELS, STORY, AD). Stories expire from
        the API 24h after posting, so this will 400 for old stories --
        callers should treat that as "no data" rather than a hard failure.

        Meta has changed which metrics are valid per media type multiple
        times, and not every metric is available on every account tier.
        Rather than let one bad metric name fail the whole post, the core
        metric set is requested together (fast path) and, if that 400s,
        each metric is retried individually so we keep whatever succeeds.
        """
        media_product_type = (media_product_type or "FEED").upper()

        if media_product_type == "STORY":
            core_metrics = STORY_METRICS
        else:
            core_metrics = list(_COMMON_METRICS)
            if media_product_type == "REELS":
                core_metrics += _REELS_METRICS

        combined: list[dict] = []
        try:
            resp = self._get(f"{media_id}/insights", {"metric": ",".join(core_metrics)})
            combined.extend(resp.get("data", []))
        except InstagramAPIError:
            for metric in core_metrics:
                try:
                    resp = self._get(f"{media_id}/insights", {"metric": metric})
                    combined.extend(resp.get("data", []))
                except InstagramAPIError:
                    continue

        if media_product_type != "STORY":
            # profile_activity needs its own call with a breakdown param.
            try:
                profile_activity = self._get(
                    f"{media_id}/insights",
                    {"metric": _PROFILE_ACTIVITY_METRIC, "breakdown": "action_type"},
                )
                combined.extend(profile_activity.get("data", []))
            except InstagramAPIError:
                pass

            for metric in _OPTIONAL_METRICS:
                try:
                    resp = self._get(f"{media_id}/insights", {"metric": metric})
                    combined.extend(resp.get("data", []))
                except InstagramAPIError:
                    continue

        return {"data": combined}
