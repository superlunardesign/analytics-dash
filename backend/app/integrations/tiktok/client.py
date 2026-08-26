"""Thin wrapper around the TikTok Display API v2 (open.tiktokapis.com).

NOTE: unlike the Instagram and Wix clients in this codebase, the exact
endpoint paths, request/response shapes, and field names below were
compiled from TikTok's public documentation via web search -- direct
fetch of developers.tiktok.com is blocked from this environment, so
none of this has been confirmed against a live call the way every other
integration here was. Treat the first real sync attempt as the actual
verification step: if a field name or response path turns out wrong,
this is the first place to check against
https://developers.tiktok.com/doc/tiktok-api-v2-video-list.

Reference (as compiled): POST /v2/video/list/ with a `fields` query
param and a `{cursor, max_count}` JSON body, returning
`data.videos[]` / `data.cursor` / `data.has_more`, plus a top-level
`error.code` ("ok" on success).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

API_BASE_URL = "https://open.tiktokapis.com"

# Requested per TikTok's `fields` query param on /v2/video/list/. Mirrors
# what this dashboard already tracks for Instagram (views/likes/comments/
# shares, thumbnail, caption/title, posted date) -- no watch-time field is
# requested since the Display API's video.list doesn't expose one (unlike
# Instagram's Insights API); average/total watch time will show as "--"
# for TikTok posts, same as any other Instagram metric TikTok has no
# equivalent for.
VIDEO_FIELDS = [
    "id",
    "title",
    "video_description",
    "cover_image_url",
    "share_url",
    "create_time",
    "duration",
    "view_count",
    "like_count",
    "comment_count",
    "share_count",
]


class TikTokAPIError(RuntimeError):
    def __init__(self, message: str, payload: dict | None = None):
        super().__init__(message)
        self.payload = payload or {}


class TikTokRateLimitError(TikTokAPIError):
    """Raised on a 429 / error.code == "rate_limit_exceeded" response.
    Confirmed live against a sandbox app's first real sync -- sandbox apps
    appear to get a notably tight quota. Distinguished from other API
    errors so a sync run can report this as "try again shortly" rather
    than a hard failure, same as InstagramRateLimitError."""


_RATE_LIMIT_ERROR_CODES = {"rate_limit_exceeded"}


def _safe_json(resp: httpx.Response) -> dict | None:
    try:
        return resp.json()
    except ValueError:
        return None


@dataclass
class TikTokClient:
    access_token: str

    def _request(self, method: str, path: str, params: dict | None = None, json: dict | None = None) -> dict:
        url = f"{API_BASE_URL}{path}"
        headers = {"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}
        resp = httpx.request(method, url, headers=headers, params=params, json=json, timeout=30)
        if resp.status_code >= 400:
            body = _safe_json(resp)
            error = (body or {}).get("error") or {}
            if resp.status_code == 429 or error.get("code") in _RATE_LIMIT_ERROR_CODES:
                raise TikTokRateLimitError(
                    f"TikTok API rate limit hit on {method} {path}: {resp.text[:2000]}", payload=body
                )
            raise TikTokAPIError(
                f"TikTok API error on {method} {path} (status {resp.status_code}): {resp.text[:2000]}",
                payload=body,
            )
        parsed = _safe_json(resp)
        if parsed is None:
            raise TikTokAPIError(f"TikTok API returned a non-JSON 2xx body on {method} {path}: {resp.text[:2000]!r}")
        error = parsed.get("error") or {}
        if error.get("code") in _RATE_LIMIT_ERROR_CODES:
            raise TikTokRateLimitError(f"TikTok API rate limit hit on {method} {path}: {error}", payload=parsed)
        if error.get("code") not in (None, "", "ok"):
            raise TikTokAPIError(f"TikTok API error on {method} {path}: {error}", payload=parsed)
        return parsed

    def _get(self, path: str, params: dict | None = None) -> dict:
        return self._request("GET", path, params=params)

    def _post(self, path: str, params: dict | None = None, json: dict | None = None) -> dict:
        return self._request("POST", path, params=params, json=json or {})

    def get_profile(self) -> dict:
        # Confirmed live (2026-08-26): this endpoint is GET, not POST -- a
        # POST here 404s with "Unsupported path(Janus)". "username" was
        # also dropped from the requested fields -- per TikTok's docs
        # (not independently confirmed live) it isn't valid under
        # user.info.basic scope, only open_id/display_name/avatar_url/
        # bio_description/union_id/profile_deep_link are -- there's no
        # @handle available at this scope tier, so account.username falls
        # back to display_name in api/tiktok.py.
        resp = self._get("/v2/user/info/", params={"fields": "open_id,display_name,avatar_url"})
        return resp.get("data", {}).get("user", {})

    def list_videos(self, cursor: str | None = None, max_count: int = 20) -> dict:
        """One page of the account's own posted videos, newest first."""
        body: dict[str, Any] = {"max_count": max_count}
        if cursor:
            body["cursor"] = cursor
        resp = self._post("/v2/video/list/", params={"fields": ",".join(VIDEO_FIELDS)}, json=body)
        return resp.get("data", {})

    def iter_all_videos(self) -> list[dict]:
        items: list[dict] = []
        cursor: str | None = None
        while True:
            page = self.list_videos(cursor=cursor)
            page_items = page.get("videos", [])
            items.extend(page_items)
            if not page.get("has_more") or not page_items:
                break
            cursor = str(page.get("cursor")) if page.get("cursor") is not None else None
            if not cursor:
                break
        return items
