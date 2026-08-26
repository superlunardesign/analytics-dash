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


def _safe_json(resp: httpx.Response) -> dict | None:
    try:
        return resp.json()
    except ValueError:
        return None


@dataclass
class TikTokClient:
    access_token: str

    def _post(self, path: str, params: dict | None = None, json: dict | None = None) -> dict:
        url = f"{API_BASE_URL}{path}"
        headers = {"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}
        resp = httpx.post(url, headers=headers, params=params, json=json or {}, timeout=30)
        if resp.status_code >= 400:
            raise TikTokAPIError(
                f"TikTok API error on POST {path} (status {resp.status_code}): {resp.text[:2000]}",
                payload=_safe_json(resp),
            )
        parsed = _safe_json(resp)
        if parsed is None:
            raise TikTokAPIError(f"TikTok API returned a non-JSON 2xx body on POST {path}: {resp.text[:2000]!r}")
        error = parsed.get("error") or {}
        if error.get("code") not in (None, "", "ok"):
            raise TikTokAPIError(f"TikTok API error on POST {path}: {error}", payload=parsed)
        return parsed

    def get_profile(self) -> dict:
        resp = self._post("/v2/user/info/", params={"fields": "open_id,display_name,username"})
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
