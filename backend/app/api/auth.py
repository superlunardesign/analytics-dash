from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.core.auth import COOKIE_NAME, SESSION_MAX_AGE_SECONDS, create_session_token, optional_tinasuze_user, verify_password
from app.core.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class StatusOut(BaseModel):
    authenticated: bool
    username: str | None = None


def _set_session_cookie(response: Response, username: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_session_token(username),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )


@router.post("/login", response_model=StatusOut)
def login(payload: LoginIn, response: Response) -> StatusOut:
    settings = get_settings()
    if not settings.tinasuze_dashboard_username or not settings.tinasuze_dashboard_password_hash:
        raise HTTPException(
            status_code=503,
            detail="Dashboard login isn't configured yet -- TINASUZE_DASHBOARD_USERNAME/PASSWORD_HASH aren't set.",
        )
    valid = payload.username == settings.tinasuze_dashboard_username and verify_password(
        payload.password, settings.tinasuze_dashboard_password_hash
    )
    if not valid:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    _set_session_cookie(response, payload.username)
    return StatusOut(authenticated=True, username=payload.username)


@router.post("/logout", status_code=204, response_model=None)
def logout(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/", secure=True, samesite="none")


@router.get("/status", response_model=StatusOut)
def status(username: str | None = Depends(optional_tinasuze_user)) -> StatusOut:
    return StatusOut(authenticated=username is not None, username=username)
