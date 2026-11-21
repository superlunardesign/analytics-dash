"""Auth for the Tinasuze dashboard section only (/api/builder/*) -- a
single hardcoded account via env vars, not a user table, since exactly
one person needs to sign in. Superlunar's own routes and the visitor-
facing /api/public/* routes are untouched by any of this.

Session is a JWT sent as an `Authorization: Bearer <token>` header the
frontend attaches itself, stored in localStorage -- not a cookie. A
cookie was the first approach here, but the frontend and API are served
from different *.onrender.com subdomains, which the browser treats as
separate "sites" for cookie purposes even though they're really one app
talking to itself -- mobile Safari (and increasingly desktop browsers)
block or silently drop exactly this kind of cross-site cookie, which
surfaced as "writes silently fail" on desktop and "can't log in at all"
on iOS. An explicit header the app attaches to each request doesn't rely
on any browser cookie policy at all, so it isn't subject to that family
of restriction in the first place.
"""

from __future__ import annotations

import hmac
import time

import jwt
from fastapi import Header, HTTPException

from app.core.config import get_settings

SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days
JWT_ALGORITHM = "HS256"


def verify_password(plain_password: str, expected_password: str) -> bool:
    # Constant-time compare -- cheap insurance against a timing attack,
    # even though this is just a plain stored password, not a hash (see
    # config.py: a single personal login gate on a Render env var, not a
    # multi-user system, so bcrypt hashing wasn't earning its keep here).
    return bool(expected_password) and hmac.compare_digest(plain_password, expected_password)


def create_session_token(username: str) -> str:
    settings = get_settings()
    payload = {"sub": username, "iat": int(time.time()), "exp": int(time.time()) + SESSION_MAX_AGE_SECONDS}
    return jwt.encode(payload, settings.secret_key, algorithm=JWT_ALGORITHM)


def _decode_session_token(token: str) -> str | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization[len("bearer ") :].strip()


def current_tinasuze_user(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency -- raises 401 unless the Authorization header
    holds a validly-signed, unexpired "Bearer <token>". The username
    inside it isn't itself re-checked against settings on every request
    (only at login); the signature is what's trusted, same as any other
    JWT session."""
    token = _bearer_token(authorization)
    username = _decode_session_token(token) if token else None
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


def optional_tinasuze_user(authorization: str | None = Header(default=None)) -> str | None:
    """Same check, but for the one endpoint (GET /api/auth/status) that
    needs to answer "are you logged in?" without itself 401ing when the
    answer is no."""
    token = _bearer_token(authorization)
    return _decode_session_token(token) if token else None
