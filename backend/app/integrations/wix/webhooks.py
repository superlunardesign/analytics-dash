"""Verifies and parses Wix webhook payloads.

The entire raw POST body is itself a signed JWT (not JSON wrapping one).
Once verified, its `data` claim is a *JSON string* containing the actual
event envelope ({instanceId, eventType, data}), and that envelope's own
`data` field is itself another JSON string with the event-specific
payload -- two layers of embedded JSON inside the JWT claim.

Reference: https://dev.wix.com/docs/build-apps/develop-your-app/frameworks/self-hosting/webhooks/handle-events-with-webhooks-for-self-hosting-without-the-java-script-sdk
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import jwt

from app.core.config import get_settings

APP_INSTANCE_INSTALLED_EVENT = "wix.app_management.app_instance.installed"


class WixWebhookVerificationError(RuntimeError):
    pass


@dataclass
class WixWebhookEvent:
    event_type: str
    instance_id: str
    data: dict[str, Any]
    raw_envelope: dict[str, Any]


def _normalize_pem_key(raw: str) -> str:
    """Reconstructs a proper multi-line PEM key regardless of how its
    newlines got mangled on the way into an env var.

    Pasting a multi-line PEM into a single-line env var field is a
    well-known pitfall (newlines silently turned into spaces or dropped,
    or escaped as literal "\\n" by some UIs), and a mangled key fails
    JWT verification with no indication of why. This tolerates all of
    those cases by finding the BEGIN/END markers, stripping every bit of
    whitespace from the base64 body between them, and re-wrapping it to
    the standard PEM line length -- a no-op on an already well-formed key.
    """
    key = raw.strip()
    if "\\n" in key and "\n" not in key:
        key = key.replace("\\n", "\n")

    header_match = re.search(r"-----BEGIN ([A-Z ]+)-----", key)
    footer_match = re.search(r"-----END ([A-Z ]+)-----", key)
    if not header_match or not footer_match:
        return key  # Doesn't look like PEM; let jwt.decode raise its own error.

    label = header_match.group(1)
    header = f"-----BEGIN {label}-----"
    footer = f"-----END {label}-----"
    body = key[header_match.end() : footer_match.start()]
    body = re.sub(r"\s+", "", body)
    lines = [body[i : i + 64] for i in range(0, len(body), 64)]
    return "\n".join([header, *lines, footer]) + "\n"


def verify_and_parse(raw_body: str) -> WixWebhookEvent:
    settings = get_settings()
    if not settings.wix_webhook_public_key:
        raise WixWebhookVerificationError("WIX_WEBHOOK_PUBLIC_KEY is not configured")

    public_key = _normalize_pem_key(settings.wix_webhook_public_key)

    try:
        claims = jwt.decode(raw_body, public_key, algorithms=["RS256"])
        envelope = json.loads(claims["data"])
        event_data = json.loads(envelope["data"]) if isinstance(envelope.get("data"), str) else envelope.get("data", {})
    except jwt.InvalidTokenError as exc:
        raise WixWebhookVerificationError(f"Invalid webhook signature: {exc}") from exc
    except (KeyError, json.JSONDecodeError) as exc:
        raise WixWebhookVerificationError(f"Unexpected webhook payload shape: {exc}") from exc

    return WixWebhookEvent(
        event_type=envelope.get("eventType", ""),
        instance_id=envelope.get("instanceId", ""),
        data=event_data,
        raw_envelope=envelope,
    )
