"""Auth for the Tinasuze dashboard section only (/api/builder/*) -- a
single hardcoded account via env vars, not a user table, since exactly
one person needs to sign in. Superlunar's own routes and the visitor-
facing /api/public/* routes are untouched by any of this.

Session is a JWT in an httponly cookie rather than a bearer token in
localStorage (not reachable by JS, so immune to XSS token theft). The
cookie needs SameSite=None + Secure because the frontend and API are
served from different *.onrender.com subdomains, which the browser
treats as separate sites for cookie purposes -- SameSite=Lax/Strict
would simply never send it back.
"""

from __future__ import annotations

import hmac
import time

import jwt
from fastapi import Cookie, HTTPException

from app.core.config import get_settings

COOKIE_NAME = "tinasuze_session"
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


def current_tinasuze_user(tinasuze_session: str | None = Cookie(default=None)) -> str:
    """FastAPI dependency -- raises 401 unless the session cookie holds a
    validly-signed, unexpired token. The username inside it isn't itself
    re-checked against settings on every request (only at login); the
    signature is what's trusted, same as any other JWT session."""
    username = _decode_session_token(tinasuze_session) if tinasuze_session else None
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


def optional_tinasuze_user(tinasuze_session: str | None = Cookie(default=None)) -> str | None:
    """Same check, but for the one endpoint (GET /api/auth/status) that
    needs to answer "are you logged in?" without itself 401ing when the
    answer is no."""
    return _decode_session_token(tinasuze_session) if tinasuze_session else None
