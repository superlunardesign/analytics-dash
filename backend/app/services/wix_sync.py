from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models import (
    SyncStatus,
    WebsiteDailyTraffic,
    WebsiteFormSubmission,
    WixConnection,
    WixSyncRun,
)
from app.integrations.wix import oauth as wix_oauth
from app.integrations.wix.client import FORMS_MODEL_ID, TRAFFIC_MODEL_ID, WixAnalyticsClient, WixAPIError, cell_value

logger = logging.getLogger(__name__)


class WixSyncAlreadyRunningError(RuntimeError):
    """Same overlapping-run hazard as Instagram's sync: a delete-then-
    reinsert against the same date window from two concurrent runs would
    race, so a second run is refused while one is already in flight."""


STALE_RUNNING_AFTER = timedelta(hours=1)


def _check_no_concurrent_run(db: Session, connection: WixConnection) -> None:
    existing = (
        db.query(WixSyncRun)
        .filter(WixSyncRun.connection_id == connection.id, WixSyncRun.status == SyncStatus.RUNNING)
        .order_by(WixSyncRun.started_at.desc())
        .first()
    )
    if existing is None:
        return
    started_at = existing.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - started_at < STALE_RUNNING_AFTER:
        raise WixSyncAlreadyRunningError(
            f"A sync for this connection started at {started_at.isoformat()} is still running."
        )


# First-ever sync for a connection backfills this far; every run after
# that just re-fetches a rolling recent window (below) since Wix's
# historical numbers don't otherwise change and there's no point paying
# for a full re-query every time.
FULL_BACKFILL_DAYS = 400

# Recent days settle over time (Wix's own numbers can shift for a day or
# two after it happens), so every sync re-fetches and overwrites this
# window rather than only ever appending forward from where it left off.
ROLLING_REFRESH_DAYS = 60

TRAFFIC_FIELDS = [
    "traffic.created_timeframe",
    "traffic.page_url_from",
    "traffic.sessions_count",
    "traffic.views_count",
    "traffic.visitors_count",
]
# Buckets traffic.created_timeframe by calendar day; parameters are set
# via a filter the same way a dimension would be, per the model schema.
TRAFFIC_FILTERS = [{"field": "timeframeGranularity", "condition": "EQUAL", "values": ["DAY"]}]

FORMS_FIELDS = [
    "forms_actions.created_date",
    "forms_actions.form_name",
    "contacts.full_name",
    "contacts.email",
]


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def sync_wix_connection(db: Session, connection: WixConnection) -> WixSyncRun:
    _check_no_concurrent_run(db, connection)

    run = WixSyncRun(connection_id=connection.id, status=SyncStatus.RUNNING)
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        token = wix_oauth.create_access_token(connection.instance_id)
        client = WixAnalyticsClient(access_token=token.access_token)
        site_timezone = client.get_site_timezone()

        is_first_sync = (
            db.query(WixSyncRun)
            .filter(WixSyncRun.connection_id == connection.id, WixSyncRun.status == SyncStatus.SUCCESS)
            .first()
            is None
        )
        lookback_days = FULL_BACKFILL_DAYS if is_first_sync else ROLLING_REFRESH_DAYS

        now = datetime.now(timezone.utc)
        start = now - timedelta(days=lookback_days)
        # end is exclusive, so add a day to include "today" fully.
        end = now + timedelta(days=1)

        rows_synced = 0

        # -- Traffic (sessions/views by day + page) --
        traffic_rows = client.iter_model_rows(
            TRAFFIC_MODEL_ID,
            TRAFFIC_FIELDS,
            _iso(start),
            _iso(end),
            site_timezone,
            filters=TRAFFIC_FILTERS,
            sort_field="traffic.created_timeframe",
        )
        db.query(WebsiteDailyTraffic).filter(
            WebsiteDailyTraffic.connection_id == connection.id,
            WebsiteDailyTraffic.date >= start,
        ).delete()
        seen_traffic_keys: set[tuple[str, str | None]] = set()
        duplicate_traffic_rows = 0
        for row in traffic_rows:
            fields = row.get("fields", {})
            date_str = cell_value(fields.get("traffic.created_timeframe"))
            if not date_str:
                continue
            page_path = cell_value(fields.get("traffic.page_url_from"))
            # (date, page_path) is the table's unique constraint -- dedupe here
            # rather than let a duplicate crash the whole sync on commit. Even
            # with sort_field set above, this is cheap insurance since the
            # model's own grouping is otherwise opaque to us.
            key = (date_str, page_path)
            if key in seen_traffic_keys:
                duplicate_traffic_rows += 1
                continue
            seen_traffic_keys.add(key)
            db.add(
                WebsiteDailyTraffic(
                    connection_id=connection.id,
                    date=datetime.fromisoformat(date_str.replace("Z", "+00:00")),
                    page_path=page_path,
                    sessions=cell_value(fields.get("traffic.sessions_count")),
                    views=cell_value(fields.get("traffic.views_count")),
                    visitors=cell_value(fields.get("traffic.visitors_count")),
                    raw_payload=row,
                )
            )
            rows_synced += 1
        if duplicate_traffic_rows:
            logger.warning(
                "Wix traffic sync for connection %s skipped %d duplicate (date, page_path) rows",
                connection.id,
                duplicate_traffic_rows,
            )
        db.commit()

        # -- Form submissions (individual rows, for applicant identity) --
        form_rows = client.iter_model_rows(
            FORMS_MODEL_ID,
            FORMS_FIELDS,
            _iso(start),
            _iso(end),
            site_timezone,
            sort_field="forms_actions.created_date",
        )
        db.query(WebsiteFormSubmission).filter(
            WebsiteFormSubmission.connection_id == connection.id,
            WebsiteFormSubmission.submitted_at >= start,
        ).delete()
        seen_form_keys: set[tuple[str, str | None, str | None]] = set()
        duplicate_form_rows = 0
        for row in form_rows:
            fields = row.get("fields", {})
            date_str = cell_value(fields.get("forms_actions.created_date"))
            if not date_str:
                continue
            form_name = cell_value(fields.get("forms_actions.form_name"))
            contact_email = cell_value(fields.get("contacts.email"))
            # No DB constraint on this table, so a duplicate wouldn't crash --
            # but it would silently double-count submissions, which is just as
            # bad for a "how many project applications came in" metric.
            key = (date_str, form_name, contact_email)
            if key in seen_form_keys:
                duplicate_form_rows += 1
                continue
            seen_form_keys.add(key)
            db.add(
                WebsiteFormSubmission(
                    connection_id=connection.id,
                    submitted_at=datetime.fromisoformat(date_str.replace("Z", "+00:00")),
                    form_name=form_name,
                    contact_name=cell_value(fields.get("contacts.full_name")),
                    contact_email=contact_email,
                    raw_payload=row,
                )
            )
            rows_synced += 1
        if duplicate_form_rows:
            logger.warning(
                "Wix forms sync for connection %s skipped %d duplicate submission rows",
                connection.id,
                duplicate_form_rows,
            )
        db.commit()

        run.status = SyncStatus.SUCCESS
        run.rows_synced = rows_synced
        run.finished_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()

    except (WixAPIError, Exception) as exc:  # noqa: BLE001 -- persist any failure onto the audit row
        db.rollback()
        run.status = SyncStatus.FAILED
        run.error_message = str(exc)
        run.finished_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        logger.exception("Wix sync failed for connection %s", connection.id)
        raise

    return run
