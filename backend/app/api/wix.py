from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import WixConnection
from app.db.session import get_db
from app.integrations.wix import oauth as wix_oauth
from app.integrations.wix.webhooks import APP_INSTANCE_INSTALLED_EVENT, WixWebhookVerificationError, verify_and_parse
from app.schemas.wix import WixStatusOut, WixSyncRunOut
from app.services.wix_sync import WixSyncAlreadyRunningError, sync_wix_connection

router = APIRouter(prefix="/api/wix", tags=["wix"])
logger = logging.getLogger(__name__)


@router.get("/install")
def install() -> RedirectResponse:
    settings = get_settings()
    redirect_url = f"{settings.frontend_base_url}/?wix_connected=true"
    return RedirectResponse(wix_oauth.build_install_url(redirect_url))


@router.post("/webhooks/app-instance-installed")
async def app_instance_installed(request: Request, db: Session = Depends(get_db)) -> dict:
    raw_body = (await request.body()).decode("utf-8")

    try:
        event = verify_and_parse(raw_body)
    except WixWebhookVerificationError as exc:
        logger.warning("Rejected Wix webhook: %s", exc)
        # 400 tells Wix not to bother retrying an unverifiable payload.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if event.event_type != APP_INSTANCE_INSTALLED_EVENT:
        # Only subscribed to this one event type; ack anything else so
        # Wix doesn't retry, but don't act on it.
        return {"status": "ignored", "eventType": event.event_type}

    existing = db.query(WixConnection).filter(WixConnection.instance_id == event.instance_id).one_or_none()
    if existing is None:
        # No separate site GUID is available on this webhook without an
        # extra API call, and the handler must respond fast (Wix retries
        # if it doesn't get a 200 within 1250ms) -- instance_id is already
        # a stable unique identifier for this installation, so it doubles
        # as site_id here. A friendlier display name can be backfilled
        # later by the sync service instead of blocking this handler on it.
        connection = WixConnection(site_id=event.instance_id, instance_id=event.instance_id)
        db.add(connection)
        db.commit()
        logger.info("Wix app installed, instance_id=%s", event.instance_id)

    return {"status": "ok"}


@router.get("/status", response_model=WixStatusOut)
def status(db: Session = Depends(get_db)) -> WixStatusOut:
    connection = db.query(WixConnection).order_by(WixConnection.connected_at.desc()).first()
    if connection is None:
        return WixStatusOut(connected=False)
    return WixStatusOut(
        connected=True,
        site_display_name=connection.site_display_name,
        connected_at=connection.connected_at,
    )


@router.post("/sync", response_model=WixSyncRunOut)
def trigger_sync(db: Session = Depends(get_db)) -> WixSyncRunOut:
    connection = db.query(WixConnection).order_by(WixConnection.connected_at.desc()).first()
    if connection is None:
        raise HTTPException(status_code=400, detail="No Wix site connected yet")

    try:
        run = sync_wix_connection(db, connection)
    except WixSyncAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 -- surface the sync failure to the caller
        raise HTTPException(status_code=502, detail=f"Sync failed: {exc}") from exc

    return WixSyncRunOut.model_validate(run)
