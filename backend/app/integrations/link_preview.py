"""Fetches a URL server-side and parses its Open Graph / meta tags for a
link-preview card -- the same technique Slack/iMessage/Twitter use to
unfurl links, applied here so pasting a product link can prefill its
name/description/image instead of typing them by hand.

Amazon in particular blocks many non-browser requests outright (more
aggressively than most sites), so this is built to degrade gracefully:
fetch_preview() never raises, it returns None on any failure (blocked,
timed out, no usable tags) so callers always have a plain manual-entry
fallback rather than treating this as something that can error out.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# A realistic browser UA measurably reduces how often this gets blocked
# outright (Amazon and some other retailers 503/CAPTCHA on obvious bot
# UAs) -- still a plain unauthenticated GET, not an attempt to evade
# detection beyond what any browser's own link-preview unfurler already does.
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


class LinkPreviewResult:
    def __init__(self, name: str | None, description: str | None, image_url: str | None):
        self.name = name
        self.description = description
        self.image_url = image_url


def _assert_public_http_url(url: str) -> None:
    """This fetches whatever URL is passed in from the backend's own
    network -- reject anything that isn't a resolvable public host so a
    pasted link can't be used to probe internal/loopback addresses
    (localhost, 169.254.169.254, etc). Only checks the initial host, not
    every redirect hop; adequate for this app's actual threat model (the
    one creator pasting her own product links), not a hardened SSRF
    defense for untrusted public input."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Only http/https links are supported")
    try:
        addr_info = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"Could not resolve host: {parsed.hostname}") from exc
    for *_rest, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ValueError("This URL points to a non-public address")


def fetch_preview(url: str) -> LinkPreviewResult | None:
    try:
        _assert_public_http_url(url)
        resp = httpx.get(url, headers=_HEADERS, timeout=10, follow_redirects=True)
        resp.raise_for_status()
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Link preview fetch failed for %s: %s", url, exc)
        return None

    try:
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:  # noqa: BLE001 -- malformed HTML shouldn't break the caller, just means no preview
        logger.info("Link preview parse failed for %s", url)
        return None

    def meta(*keys: str) -> str | None:
        for key in keys:
            tag = soup.find("meta", attrs={"property": key}) or soup.find("meta", attrs={"name": key})
            content = tag.get("content") if tag else None
            if content:
                return content.strip()
        return None

    name = meta("og:title", "twitter:title")
    if not name and soup.title and soup.title.string:
        name = soup.title.string.strip()
    description = meta("og:description", "twitter:description", "description")
    image_url = meta("og:image", "twitter:image")

    if not name and not image_url:
        return None
    return LinkPreviewResult(name=name, description=description, image_url=image_url)
