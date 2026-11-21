from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import create_session_token, optional_tinasuze_user, verify_password
from app.core.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class StatusOut(BaseModel):
    authenticated: bool
    username: str | None = None


class LoginOut(StatusOut):
    # The frontend stores this in localStorage and sends it back as
    # Authorization: Bearer <token> on every /api/builder/* request -- see
    # app/core/auth.py for why this isn't a cookie.
    token: str


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn) -> LoginOut:
    settings = get_settings()
    if not settings.tinasuze_dashboard_username or not settings.tinasuze_dashboard_password:
        raise HTTPException(
            status_code=503,
            detail="Dashboard login isn't configured yet -- TINASUZE_DASHBOARD_USERNAME/PASSWORD aren't set.",
        )
    valid = payload.username == settings.tinasuze_dashboard_username and verify_password(
        payload.password, settings.tinasuze_dashboard_password
    )
    if not valid:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = create_session_token(payload.username)
    return LoginOut(authenticated=True, username=payload.username, token=token)


@router.post("/logout", status_code=204, response_model=None)
def logout() -> None:
    # Stateless JWT -- there's nothing server-side to invalidate. The
    # frontend just discards its stored token; this endpoint exists for API
    # symmetry (and in case a revocation list is ever worth adding later).
    return None


@router.get("/status", response_model=StatusOut)
def status(username: str | None = Depends(optional_tinasuze_user)) -> StatusOut:
    return StatusOut(authenticated=username is not None, username=username)
