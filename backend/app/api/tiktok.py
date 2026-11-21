from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import encrypt_token
from app.db.models import Account, Brand, Platform
from app.db.session import get_db
from app.integrations.tiktok import oauth as tiktok_oauth
from app.integrations.tiktok.client import TikTokClient
from app.schemas.account import AccountStatusOut, SyncRunOut
from app.services.tiktok_sync import TikTokSyncAlreadyRunningError, sync_tiktok_account

router = APIRouter(prefix="/api/tiktok", tags=["tiktok"])

STATE_COOKIE_NAME = "tiktok_oauth_state"
BRAND_COOKIE_NAME = "tiktok_oauth_brand"

# Where each brand lands after connecting -- Superlunar's own dashboard
# home vs Tinasuze's Content Overview tab, so connecting Tinasuze's
# account doesn't bounce her onto the Superlunar side.
_POST_CONNECT_PATH = {
    Brand.SUPERLUNAR: "/",
    Brand.TINASUZE: "/builder/content",
}


@router.get("/oauth/start")
def oauth_start(brand: Brand = Query(Brand.SUPERLUNAR)) -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    redirect = RedirectResponse(tiktok_oauth.build_authorize_url(state))
    redirect.set_cookie(STATE_COOKIE_NAME, state, max_age=600, httponly=True, samesite="lax")
    redirect.set_cookie(BRAND_COOKIE_NAME, brand.value, max_age=600, httponly=True, samesite="lax")
    return redirect


@router.get("/oauth/callback")
def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    tiktok_oauth_state: str | None = Cookie(default=None),
    tiktok_oauth_brand: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    settings = get_settings()
    # Defaults to Superlunar if the cookie's missing/expired (e.g. the
    # flow took over 10 minutes) -- safe fallback, matches this
    # integration's original (pre-brand) behavior rather than guessing.
    brand = Brand(tiktok_oauth_brand) if tiktok_oauth_brand in (b.value for b in Brand) else Brand.SUPERLUNAR
    post_connect_path = _POST_CONNECT_PATH[brand]

    if error:
        return RedirectResponse(f"{settings.frontend_base_url}{post_connect_path}?tiktok_error={error}")
    if not code or not state or not tiktok_oauth_state or state != tiktok_oauth_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    token = tiktok_oauth.exchange_code_for_token(code)

    client = TikTokClient(access_token=token.access_token)
    profile = client.get_profile()

    external_account_id = str(profile.get("open_id") or token.open_id)
    account = (
        db.query(Account)
        .filter(Account.platform == Platform.TIKTOK, Account.external_account_id == external_account_id)
        .one_or_none()
    )
    if account is None:
        account = Account(platform=Platform.TIKTOK, external_account_id=external_account_id)

    account.brand = brand
    # TikTok's user.info.basic scope doesn't expose the @handle -- only
    # display_name -- so that's what both fields fall back to (see
    # client.py's get_profile docstring).
    account.username = profile.get("display_name")
    account.display_name = profile.get("display_name")
    account.access_token_encrypted = encrypt_token(token.access_token)
    if token.refresh_token:
        account.refresh_token_encrypted = encrypt_token(token.refresh_token)
    if token.expires_in:
        account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=token.expires_in)

    db.add(account)
    db.commit()

    redirect = RedirectResponse(f"{settings.frontend_base_url}{post_connect_path}?connected=tiktok")
    redirect.delete_cookie(STATE_COOKIE_NAME)
    redirect.delete_cookie(BRAND_COOKIE_NAME)
    return redirect


@router.get("/status", response_model=AccountStatusOut)
def status(brand: Brand = Query(Brand.SUPERLUNAR), db: Session = Depends(get_db)) -> AccountStatusOut:
    account = db.query(Account).filter(Account.platform == Platform.TIKTOK, Account.brand == brand).one_or_none()
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
def trigger_sync(brand: Brand = Query(Brand.SUPERLUNAR), db: Session = Depends(get_db)) -> SyncRunOut:
    account = db.query(Account).filter(Account.platform == Platform.TIKTOK, Account.brand == brand).one_or_none()
    if account is None:
        raise HTTPException(status_code=400, detail="No TikTok account connected yet")

    try:
        run = sync_tiktok_account(db, account)
    except TikTokSyncAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 -- surface the sync failure to the caller
        raise HTTPException(status_code=502, detail=f"Sync failed: {exc}") from exc

    return SyncRunOut.model_validate(run)
