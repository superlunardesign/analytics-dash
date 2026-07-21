from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.db.models import WebsiteDailyTraffic, WebsiteFormSubmission, WixConnection, WixSyncRun
from app.db.session import get_db
from app.integrations.wix import oauth as wix_oauth
from app.integrations.wix.webhooks import APP_INSTANCE_INSTALLED_EVENT, WixWebhookVerificationError, verify_and_parse
from app.schemas.wix import WixStatusOut, WixSyncRunOut
from app.services.wix_sync import WixSyncAlreadyRunningError, sync_wix_connection

router = APIRouter(prefix="/api/wix", tags=["wix"])
logger = logging.getLogger(__name__)


@router.get("/install")
def install() -> RedirectResponse:
    return RedirectResponse(wix_oauth.build_install_url())


@router.post("/webhooks/app-instance-installed")
async def app_instance_installed(request: Request, db: Session = Depends(get_db)) -> dict:
    raw_body = (await request.body()).decode("utf-8")

    try:
        event = verify_and_parse(raw_body)
    except WixWebhookVerificationError as exc:
        logger.warning("Rejected Wix webhook: %s", exc)
        # 400 tells Wix not to bother retrying an unverifiable payload.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Logged unconditionally (not just on mismatch) so the *actual* string
    # Wix sends is visible even when everything looks fine from Wix's
    # side -- this event type was never confirmed against official docs
    # (both Meta's and Wix's blocked direct fetches at different points),
    # only inferred from a summarized search result. A silent mismatch
    # here would make every install look successful to Wix while quietly
    # doing nothing on our end, which matches exactly what's been observed.
    logger.info("Received Wix webhook: eventType=%r instanceId=%r raw_envelope=%r", event.event_type, event.instance_id, event.raw_envelope)

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


@router.get("/connection/fix-instance-id", response_model=WixStatusOut)
def fix_instance_id(instance_id: str, db: Session = Depends(get_db)) -> WixStatusOut:
    """Manual escape hatch: corrects the stored instance_id to whatever
    Wix's own app dashboard currently shows as installed on the site.
    A GET with a query param (not the usual POST-for-mutation) so it's
    just a URL that can be pasted into a browser, no HTTP client needed.

    Exists because of a real failure mode -- several AppInstalled
    webhooks fired during troubleshooting (dev-site tests, retries
    before a bug fix landed, reinstalls to pick up new permissions), each
    with a different instance_id, and the one that happened to get
    stored first (or most recently) isn't necessarily the one that's
    actually still valid or the one with real synced history. There's no
    supported way to ask Wix "what's the current instance_id for this
    site" directly, so this just takes the value the site owner can see
    for themselves and uses it as the source of truth.
    """
    connections = db.query(WixConnection).order_by(WixConnection.connected_at.desc()).all()
    if not connections:
        connection = WixConnection(site_id=instance_id, instance_id=instance_id)
        db.add(connection)
        db.commit()
        db.refresh(connection)
        logger.info("Manually corrected Wix connection instance_id to %s", instance_id)
        return WixStatusOut(
            connected=True, site_display_name=connection.site_display_name, connected_at=connection.connected_at
        )

    def _has_data(c: WixConnection) -> bool:
        return (
            db.query(WebsiteDailyTraffic).filter(WebsiteDailyTraffic.connection_id == c.id).first() is not None
            or db.query(WebsiteFormSubmission).filter(WebsiteFormSubmission.connection_id == c.id).first() is not None
        )

    # Prefer the row with real synced history over "most recently
    # created" -- a repeat AppInstalled webhook (dev-site tests, a
    # reinstall to pick up new permissions) creates a brand-new, empty
    # row that would otherwise look like "the" connection purely by being
    # newest, silently orphaning the row with all the actual data.
    data_rows = [c for c in connections if _has_data(c)]
    connection = data_rows[0] if data_rows else connections[0]

    # Clean up every OTHER empty duplicate, not just one colliding on
    # site_id -- sync_cron.py syncs every WixConnection row it finds, and
    # other endpoints pick "most recent", so any stray empty row left
    # behind causes confusing repeated failures (or gets mistaken for the
    # real connection once it's the newest) elsewhere in the app.
    for other in connections:
        if other.id == connection.id:
            continue
        if _has_data(other):
            if other.site_id == instance_id:
                # A different row has both real data AND already claims
                # this exact site_id -- can't resolve that without a
                # human decision. Check the debug endpoint and pick one.
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Connection {other.id} already uses site_id={instance_id!r} and has synced data of its "
                        "own -- refusing to overwrite it automatically. Check GET /api/wix/connections/debug to "
                        "see both rows and decide which one to keep."
                    ),
                )
            continue
        db.delete(other)
    # Flush the deletes before the update below -- SQLAlchemy's default
    # flush ordering runs UPDATEs before DELETEs within one commit, so
    # without this the update can hit the unique constraint against a row
    # that's already marked for deletion but not yet actually gone.
    db.flush()

    connection.instance_id = instance_id
    connection.site_id = instance_id
    db.add(connection)
    db.commit()
    db.refresh(connection)
    logger.info("Manually corrected Wix connection instance_id to %s", instance_id)

    return WixStatusOut(
        connected=True,
        site_display_name=connection.site_display_name,
        connected_at=connection.connected_at,
    )


@router.get("/connections/debug")
def debug_connections(db: Session = Depends(get_db)) -> list[dict]:
    """Read-only troubleshooting view: every WixConnection row with how
    much synced data sits under each one. A repeat AppInstalled webhook
    (dev-site tests, a reinstall/update) creates a new row rather than
    updating the existing one, so more than one row here means there's a
    stray duplicate -- this is how to tell which one is the real,
    data-rich connection versus an empty leftover, instead of guessing.
    Not used by the app itself."""
    connections = db.query(WixConnection).order_by(WixConnection.connected_at.desc()).all()
    result = []
    for c in connections:
        last_sync = (
            db.query(WixSyncRun)
            .filter(WixSyncRun.connection_id == c.id)
            .order_by(WixSyncRun.started_at.desc())
            .first()
        )
        result.append(
            {
                "id": c.id,
                "site_id": c.site_id,
                "instance_id": c.instance_id,
                "site_display_name": c.site_display_name,
                "connected_at": c.connected_at,
                "updated_at": c.updated_at,
                "traffic_rows": db.query(WebsiteDailyTraffic).filter(WebsiteDailyTraffic.connection_id == c.id).count(),
                "form_submission_rows": db.query(WebsiteFormSubmission)
                .filter(WebsiteFormSubmission.connection_id == c.id)
                .count(),
                "sync_run_count": db.query(WixSyncRun).filter(WixSyncRun.connection_id == c.id).count(),
                "last_sync_status": last_sync.status if last_sync else None,
                "last_sync_finished_at": last_sync.finished_at if last_sync else None,
            }
        )
    return result


@router.post("/sync", response_model=WixSyncRunOut)
def trigger_sync(full: bool = False, db: Session = Depends(get_db)) -> WixSyncRunOut:
    """`full=true` forces a full historical re-backfill instead of the
    normal rolling-window refresh -- use it after a query/filter change to
    purge rows further back than ROLLING_REFRESH_DAYS that a normal sync
    would otherwise never touch again."""
    connection = db.query(WixConnection).order_by(WixConnection.connected_at.desc()).first()
    if connection is None:
        raise HTTPException(status_code=400, detail="No Wix site connected yet")

    try:
        run = sync_wix_connection(db, connection, force_full_backfill=full)
    except WixSyncAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 -- surface the sync failure to the caller
        raise HTTPException(status_code=502, detail=f"Sync failed: {exc}") from exc

    return WixSyncRunOut.model_validate(run)
