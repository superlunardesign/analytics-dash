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


def verify_and_parse(raw_body: str) -> WixWebhookEvent:
    settings = get_settings()
    if not settings.wix_webhook_public_key:
        raise WixWebhookVerificationError("WIX_WEBHOOK_PUBLIC_KEY is not configured")

    try:
        claims = jwt.decode(raw_body, settings.wix_webhook_public_key, algorithms=["RS256"])
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
    )
