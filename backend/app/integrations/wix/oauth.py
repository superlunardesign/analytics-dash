"""Wix custom app authentication.

Unlike Instagram's user-delegated OAuth, Wix's current (non-deprecated)
auth model follows the OAuth Client Credentials protocol: there's no
redirect handshake to implement at all. The site owner installs the app
through Wix's own UI (via the install link below), Wix fires the
"App Instance Installed" webhook to tell us the resulting `instanceId`
(see webhooks.py), and from then on the backend mints short-lived access
tokens on demand with just app_id + app_secret + instance_id -- no
refresh token to store or rotate.

Reference: https://dev.wix.com/docs/build-apps/develop-your-app/access/authentication/about-oauth
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

INSTALL_URL = "https://www.wix.com/installer/install"
TOKEN_URL = "https://www.wixapis.com/oauth2/token"


def build_install_url(redirect_url: str, state: str | None = None) -> str:
    settings = get_settings()
    params = {"appId": settings.wix_app_id, "redirectUrl": redirect_url}
    if state:
        params["state"] = state
    return f"{INSTALL_URL}?{urlencode(params)}"


@dataclass
class WixAccessToken:
    access_token: str
    expires_in: int  # seconds; Wix app-instance tokens are valid for 4 hours


def create_access_token(instance_id: str) -> WixAccessToken:
    settings = get_settings()
    resp = httpx.post(
        TOKEN_URL,
        json={
            "grant_type": "client_credentials",
            "client_id": settings.wix_app_id,
            "client_secret": settings.wix_app_secret,
            "instance_id": instance_id,
        },
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    return WixAccessToken(access_token=body["access_token"], expires_in=body.get("expires_in", 14400))
