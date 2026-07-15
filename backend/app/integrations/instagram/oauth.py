"""OAuth against "Instagram API with Instagram Login" (Business Login).

This is Meta's current recommended flow for a single creator connecting
their own Instagram professional (Business/Creator) account -- it does
NOT require linking a Facebook Page, unlike the older Facebook Login
flow. Reference: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/

Scopes requested:
  - instagram_business_basic: profile + media read access.
  - instagram_business_manage_insights: required for the /insights edge
    (views, saves, shares, profile_activity, watch time, etc).

Since this app only ever needs to authorize its own owner's account, no
Meta App Review is required -- add yourself as a "tester" on the app in
the Meta App Dashboard instead. See backend/README.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize"
TOKEN_URL = "https://api.instagram.com/oauth/access_token"
GRAPH_BASE_URL = "https://graph.instagram.com"

SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"]


@dataclass
class TokenResult:
    access_token: str
    expires_in: int | None  # seconds; None for short-lived tokens
    user_id: str | None = None


def build_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.instagram_redirect_uri,
        "scope": ",".join(SCOPES),
        "response_type": "code",
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code_for_short_lived_token(code: str) -> TokenResult:
    settings = get_settings()
    data = {
        "client_id": settings.meta_app_id,
        "client_secret": settings.meta_app_secret,
        "grant_type": "authorization_code",
        "redirect_uri": settings.instagram_redirect_uri,
        "code": code,
    }
    resp = httpx.post(TOKEN_URL, data=data, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    return TokenResult(access_token=body["access_token"], expires_in=None, user_id=str(body.get("user_id", "")))


def exchange_for_long_lived_token(short_lived_token: str) -> TokenResult:
    settings = get_settings()
    params = {
        "grant_type": "ig_exchange_token",
        "client_secret": settings.meta_app_secret,
        "access_token": short_lived_token,
    }
    resp = httpx.get(f"{GRAPH_BASE_URL}/access_token", params=params, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    return TokenResult(access_token=body["access_token"], expires_in=body.get("expires_in"))


def refresh_long_lived_token(current_token: str) -> TokenResult:
    """Long-lived tokens last 60 days and must be refreshed before they expire
    (Meta requires the token be at least 24h old and not yet expired)."""
    params = {"grant_type": "ig_refresh_token", "access_token": current_token}
    resp = httpx.get(f"{GRAPH_BASE_URL}/refresh_access_token", params=params, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    return TokenResult(access_token=body["access_token"], expires_in=body.get("expires_in"))
