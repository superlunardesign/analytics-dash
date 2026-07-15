from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import encrypt_token
from app.db.models import Account, Platform
from app.db.session import get_db
from app.integrations.instagram import oauth as ig_oauth
from app.integrations.instagram.client import InstagramClient
from app.schemas.account import AccountStatusOut, SyncRunOut
from app.services.instagram_sync import sync_instagram_account

router = APIRouter(prefix="/api/instagram", tags=["instagram"])

STATE_COOKIE_NAME = "ig_oauth_state"


@router.get("/oauth/start")
def oauth_start(response: Response) -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    redirect = RedirectResponse(ig_oauth.build_authorize_url(state))
    redirect.set_cookie(
        STATE_COOKIE_NAME,
        state,
        max_age=600,
        httponly=True,
        samesite="lax",
    )
    return redirect


@router.get("/oauth/callback")
def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    ig_oauth_state: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    settings = get_settings()

    if error:
        return RedirectResponse(f"{settings.frontend_base_url}/?instagram_error={error}")
    if not code or not state or not ig_oauth_state or state != ig_oauth_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    short_lived = ig_oauth.exchange_code_for_short_lived_token(code)
    long_lived = ig_oauth.exchange_for_long_lived_token(short_lived.access_token)

    client = InstagramClient(access_token=long_lived.access_token)
    profile = client.get_profile()

    external_account_id = str(profile.get("user_id") or short_lived.user_id)
    account = (
        db.query(Account)
        .filter(Account.platform == Platform.INSTAGRAM, Account.external_account_id == external_account_id)
        .one_or_none()
    )
    if account is None:
        account = Account(platform=Platform.INSTAGRAM, external_account_id=external_account_id)

    account.username = profile.get("username")
    account.display_name = profile.get("name")
    account.access_token_encrypted = encrypt_token(long_lived.access_token)
    if long_lived.expires_in:
        account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=long_lived.expires_in)
    account.extra = {"account_type": profile.get("account_type")}

    db.add(account)
    db.commit()

    redirect = RedirectResponse(f"{settings.frontend_base_url}/?connected=instagram")
    redirect.delete_cookie(STATE_COOKIE_NAME)
    return redirect


@router.get("/status", response_model=AccountStatusOut)
def status(db: Session = Depends(get_db)) -> AccountStatusOut:
    account = db.query(Account).filter(Account.platform == Platform.INSTAGRAM).one_or_none()
    if account is None:
        return AccountStatusOut(connected=False)
    return AccountStatusOut(
        connected=True,
        username=account.username,
        display_name=account.display_name,
        connected_at=account.connected_at,
        token_expires_at=account.token_expires_at,
    )


@router.post("/sync", response_model=SyncRunOut)
def trigger_sync(db: Session = Depends(get_db)) -> SyncRunOut:
    account = db.query(Account).filter(Account.platform == Platform.INSTAGRAM).one_or_none()
    if account is None:
        raise HTTPException(status_code=400, detail="No Instagram account connected yet")

    try:
        run = sync_instagram_account(db, account)
    except Exception as exc:  # noqa: BLE001 -- surface the sync failure to the caller
        raise HTTPException(status_code=502, detail=f"Sync failed: {exc}") from exc

    return SyncRunOut.model_validate(run)
