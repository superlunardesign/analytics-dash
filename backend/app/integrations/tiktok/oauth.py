"""OAuth against TikTok Login Kit (OAuth v2).

Reference: https://developers.tiktok.com/doc/login-kit-web

Unlike Instagram's flow, the code-for-token exchange and the refresh
exchange are the SAME shared endpoint (distinguished only by `grant_type`),
and TikTok hands back both an access token (24h) and a refresh token
(365d) up front -- no separate long-lived-token exchange step.

Scopes requested:
  - user.info.basic: profile (open_id, display_name, avatar).
  - video.list: this creator's own posted videos, including per-video
    view/like/comment/share counts via the `fields` param -- see client.py.

Since this app only ever needs to authorize its own owner's account (not
the wider public), no TikTok app review beyond enabling these two scopes
in the app dashboard should be required. See backend/README.md.

NOTE: unlike the Instagram and Wix integrations in this codebase, the
exact endpoint shapes below were compiled from TikTok's public docs via
web search (direct fetch of developers.tiktok.com is blocked from this
environment) rather than a live-verified call. Treat the first real
OAuth attempt as the actual test, same as any other TikTok API detail in
this module -- see client.py's docstring for the same caveat.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"

SCOPES = ["user.info.basic", "video.list"]


@dataclass
class TokenResult:
    access_token: str
    expires_in: int | None  # seconds; ~86400 (24h)
    refresh_token: str | None = None
    refresh_expires_in: int | None = None  # seconds; ~31536000 (365d)
    open_id: str | None = None


def build_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_key": settings.tiktok_client_key,
        "redirect_uri": settings.tiktok_redirect_uri,
        "scope": ",".join(SCOPES),
        "response_type": "code",
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def _token_request(data: dict) -> TokenResult:
    settings = get_settings()
    body = {
        "client_key": settings.tiktok_client_key,
        "client_secret": settings.tiktok_client_secret,
        **data,
    }
    resp = httpx.post(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    payload = resp.json()
    if "error" in payload and payload.get("error") not in (None, "", "ok"):
        raise RuntimeError(f"TikTok token request failed: {payload}")
    return TokenResult(
        access_token=payload["access_token"],
        expires_in=payload.get("expires_in"),
        refresh_token=payload.get("refresh_token"),
        refresh_expires_in=payload.get("refresh_expires_in"),
        open_id=payload.get("open_id"),
    )


def exchange_code_for_token(code: str) -> TokenResult:
    settings = get_settings()
    return _token_request(
        {
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.tiktok_redirect_uri,
        }
    )


def refresh_access_token(refresh_token: str) -> TokenResult:
    return _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
