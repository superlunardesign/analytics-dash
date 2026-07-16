from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.db.models import (
    SyncStatus,
    WebsiteDailyTraffic,
    WebsiteFormSubmission,
    WixConnection,
    WixFormSchema,
    WixSyncRun,
)
from app.integrations.wix import oauth as wix_oauth
from app.integrations.wix.client import TRAFFIC_MODEL_ID, WixAnalyticsClient, WixAPIError, cell_value
from app.integrations.wix.forms_client import WixFormsClient, extract_question_fields

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
# for a full re-query every time. 1000 days covers the earliest data
# confirmed live on the reference site (traffic starts ~Jan 2024, nothing
# in 2023) with margin; Wix itself is the real limit here, not this
# number -- widening past what Wix actually retains just fetches empty
# pages.
FULL_BACKFILL_DAYS = 1000

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

def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _find_target_by_field_type(schema_fields: list[dict], field_type: str) -> str | None:
    for f in schema_fields:
        if f["field_type"] == field_type:
            return f["target"]
    return None


def _upsert_form_schema(db: Session, connection_id: str, form_id: str, form_name: str | None, fields: list[dict]) -> None:
    table = WixFormSchema.__table__
    dialect = db.get_bind().dialect.name
    insert_fn = pg_insert if dialect == "postgresql" else sqlite_insert
    stmt = insert_fn(table).values(
        [
            {
                "connection_id": connection_id,
                "form_id": form_id,
                "form_name": form_name,
                "fields": fields,
                "synced_at": datetime.now(timezone.utc),
            }
        ]
    )
    update_cols = {col: stmt.excluded[col] for col in ("form_name", "fields", "synced_at")}
    stmt = stmt.on_conflict_do_update(index_elements=["connection_id", "form_id"], set_=update_cols)
    db.execute(stmt)


def _upsert_form_submissions(db: Session, rows: list[dict]) -> None:
    """Unlike the old forms-actions-semantic-model sync, Wix's Form
    Submission API gives every submission a real, permanent ID -- upsert
    keys off that directly instead of a guessed composite natural key, so
    there's no boundary-day/timezone ambiguity to worry about at all."""
    if not rows:
        return
    table = WebsiteFormSubmission.__table__
    dialect = db.get_bind().dialect.name
    insert_fn = pg_insert if dialect == "postgresql" else sqlite_insert
    stmt = insert_fn(table).values(rows)
    update_cols = {col: stmt.excluded[col] for col in ("contact_name", "contact_email", "status", "fields", "raw_payload")}
    stmt = stmt.on_conflict_do_update(index_elements=["wix_submission_id"], set_=update_cols)
    db.execute(stmt)


def _upsert_traffic_rows(db: Session, rows: list[dict]) -> None:
    """INSERT ... ON CONFLICT DO UPDATE on (connection_id, date, page_path),
    instead of a plain bulk INSERT.

    The delete-then-reinsert below is a best-effort cleanup for rows that
    no longer appear in this run's fetch, but it isn't a reliable guarantee
    that no (date, page_path) already in the table will be re-fetched --
    e.g. Wix buckets rows by calendar day in the *site's* timezone, while
    the delete filter compares against a precise UTC instant, so the
    earliest day in a rolling refresh window can be returned by Wix's fetch
    (day-level rounding) without having been deleted (precise-instant
    compare), and a resulting insert of the exact same (date, page_path)
    then hits the unique constraint. Upserting makes that scenario a no-op
    correction instead of a crash, regardless of the exact cause.
    """
    if not rows:
        return
    table = WebsiteDailyTraffic.__table__
    dialect = db.get_bind().dialect.name
    insert_fn = pg_insert if dialect == "postgresql" else sqlite_insert
    stmt = insert_fn(table).values(rows)
    update_cols = {col: stmt.excluded[col] for col in ("sessions", "views", "visitors", "raw_payload")}
    stmt = stmt.on_conflict_do_update(
        index_elements=["connection_id", "date", "page_path"],
        set_=update_cols,
    )
    db.execute(stmt)


def sync_wix_connection(db: Session, connection: WixConnection, force_full_backfill: bool = False) -> WixSyncRun:
    """`force_full_backfill` re-processes the full FULL_BACKFILL_DAYS window
    instead of just the ROLLING_REFRESH_DAYS one -- needed to purge rows
    from before a filter/query change (e.g. FORMS_FILTERS) that are now
    outside the rolling window and so never get touched by a normal sync
    again. A normal rolling sync only deletes+refetches the recent window,
    so older bad rows from an earlier bug just sit there forever otherwise."""
    _check_no_concurrent_run(db, connection)

    run = WixSyncRun(connection_id=connection.id, status=SyncStatus.RUNNING)
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        token = wix_oauth.create_access_token(connection.instance_id)
        client = WixAnalyticsClient(access_token=token.access_token)
        forms_client = WixFormsClient(access_token=token.access_token)
        site_timezone = client.get_site_timezone()

        is_first_sync = (
            db.query(WixSyncRun)
            .filter(WixSyncRun.connection_id == connection.id, WixSyncRun.status == SyncStatus.SUCCESS)
            .first()
            is None
        )
        lookback_days = FULL_BACKFILL_DAYS if (is_first_sync or force_full_backfill) else ROLLING_REFRESH_DAYS

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
        traffic_values: list[dict] = []
        for row in traffic_rows:
            fields = row.get("fields", {})
            date_str = cell_value(fields.get("traffic.created_timeframe"))
            if not date_str:
                continue
            page_path = cell_value(fields.get("traffic.page_url_from"))
            # (date, page_path) is the table's unique constraint -- dedupe here
            # too (on top of the upsert below) since a duplicate within the
            # same batch would otherwise violate Postgres's "ON CONFLICT
            # DO UPDATE command cannot affect row a second time" restriction.
            key = (date_str, page_path)
            if key in seen_traffic_keys:
                duplicate_traffic_rows += 1
                continue
            seen_traffic_keys.add(key)
            traffic_values.append(
                {
                    "connection_id": connection.id,
                    "date": datetime.fromisoformat(date_str.replace("Z", "+00:00")),
                    "page_path": page_path,
                    "sessions": cell_value(fields.get("traffic.sessions_count")),
                    "views": cell_value(fields.get("traffic.views_count")),
                    "visitors": cell_value(fields.get("traffic.visitors_count")),
                    "raw_payload": row,
                }
            )
            rows_synced += 1
        if duplicate_traffic_rows:
            logger.warning(
                "Wix traffic sync for connection %s skipped %d duplicate (date, page_path) rows",
                connection.id,
                duplicate_traffic_rows,
            )
        _upsert_traffic_rows(db, traffic_values)
        db.commit()

        # -- Forms: schema (question labels) + full submission answers,
        # via the Form Submission API. Unlike the old forms-actions
        # semantic-model source, this only ever returns real completed
        # submissions (no views/started noise, no form_action_type
        # filtering needed) and gives each one a real permanent ID, so
        # there's no rolling window or boundary-day dedupe concern here --
        # every sync just fetches the complete current set for every form.
        forms = forms_client.iter_forms()
        submission_values: list[dict] = []
        seen_submission_ids: set[str] = set()
        for form in forms:
            form_id = form.get("id")
            if not form_id:
                continue
            form_name = form.get("name") or form.get("properties", {}).get("name")
            full_form = forms_client.get_form(form_id)
            schema_fields = extract_question_fields(full_form)
            _upsert_form_schema(db, connection.id, form_id, form_name, schema_fields)

            first_name_target = _find_target_by_field_type(schema_fields, "CONTACTS_FIRST_NAME")
            last_name_target = _find_target_by_field_type(schema_fields, "CONTACTS_LAST_NAME")
            email_target = _find_target_by_field_type(schema_fields, "CONTACTS_EMAIL")

            for submission in forms_client.iter_submissions(form_id):
                wix_submission_id = submission.get("id")
                created_date = submission.get("createdDate")
                if not wix_submission_id or not created_date or wix_submission_id in seen_submission_ids:
                    continue
                seen_submission_ids.add(wix_submission_id)
                answers = submission.get("submissions", {}) or {}
                first = answers.get(first_name_target) if first_name_target else None
                last = answers.get(last_name_target) if last_name_target else None
                contact_name = " ".join(p for p in (first, last) if p) or None
                submission_values.append(
                    {
                        "connection_id": connection.id,
                        "wix_submission_id": wix_submission_id,
                        "wix_form_id": form_id,
                        "submitted_at": datetime.fromisoformat(created_date.replace("Z", "+00:00")),
                        "form_name": form_name,
                        "contact_name": contact_name,
                        "contact_email": answers.get(email_target) if email_target else None,
                        "status": submission.get("status"),
                        "fields": answers,
                        "raw_payload": submission,
                    }
                )
                rows_synced += 1
        db.commit()

        _upsert_form_submissions(db, submission_values)
        if forms:
            # Full reconciliation: since every form's complete current
            # submission set was just fetched, anything previously synced
            # that didn't come back this time was deleted on Wix's side.
            db.query(WebsiteFormSubmission).filter(
                WebsiteFormSubmission.connection_id == connection.id,
                WebsiteFormSubmission.wix_submission_id.isnot(None),
                ~WebsiteFormSubmission.wix_submission_id.in_(seen_submission_ids),
            ).delete(synchronize_session=False)
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
