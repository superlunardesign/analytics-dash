"""Detects an Amazon ASIN from a product link, so a carousel's "Add All
to Cart" button can be built without the creator ever having to look one
up by hand. Amazon's bulk add-to-cart endpoint
(amazon.com/gp/aws/cart/add.html) takes ASIN.N/Quantity.N query params
plus an AssociateTag -- see ElementRenderer.tsx on the frontend for where
that URL actually gets built.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

import httpx

from app.integrations.link_preview import HEADERS, assert_public_http_url

logger = logging.getLogger(__name__)

# /dp/ASIN, /gp/product/ASIN, /gp/aw/d/ASIN, /exec/obidos/asin/ASIN(/...),
# or a bare ?asin=ASIN query param -- covers every Amazon URL shape in
# practice; an ASIN is always 10 uppercase letters/digits.
_ASIN_PATH_RE = re.compile(r"/(?:dp|gp/product|gp/aw/d|exec/obidos/asin)/([A-Z0-9]{10})(?:[/?]|$)", re.IGNORECASE)
_ASIN_QUERY_RE = re.compile(r"[?&]asin=([A-Z0-9]{10})", re.IGNORECASE)

# Link shorteners that need resolving before an ASIN is visible at all --
# a bare amazon.com/amzn.to host check, not a full allowlist, since any
# other domain just means "not an Amazon link" and correctly yields None.
_AMAZON_HOST_RE = re.compile(r"(^|\.)amazon\.[a-z.]+$", re.IGNORECASE)
_SHORTENER_HOST_RE = re.compile(r"^(amzn\.to|a\.co)$", re.IGNORECASE)


def _find_asin(url: str) -> str | None:
    match = _ASIN_PATH_RE.search(url) or _ASIN_QUERY_RE.search(url)
    return match.group(1).upper() if match else None


def extract_amazon_asin(url: str) -> str | None:
    """Best-effort, never raises -- returns None for anything that isn't
    a recognizable Amazon product link, including on any network failure
    resolving a shortened one."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None

    is_amazon = bool(_AMAZON_HOST_RE.search(host))
    is_shortener = bool(_SHORTENER_HOST_RE.match(host))
    if not is_amazon and not is_shortener:
        return None

    asin = _find_asin(url)
    if asin:
        return asin
    if not is_shortener:
        return None

    # A shortened link's ASIN only becomes visible after following the
    # redirect to the real product page.
    try:
        assert_public_http_url(url)
        resp = httpx.get(url, headers=HEADERS, timeout=10, follow_redirects=True)
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Amazon ASIN resolution failed for %s: %s", url, exc)
        return None
    return _find_asin(str(resp.url))
