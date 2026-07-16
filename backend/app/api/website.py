from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import WebsiteDailyTraffic, WebsiteFormSubmission, WixConnection, WixFormSchema
from app.db.session import get_db
from app.schemas.website import DailyTrafficOut, FormSchemaOut, FormSubmissionOut, TopPageOut

router = APIRouter(prefix="/api/website", tags=["website"])


def _current_connection(db: Session) -> WixConnection:
    connection = db.query(WixConnection).order_by(WixConnection.connected_at.desc()).first()
    if connection is None:
        raise HTTPException(status_code=400, detail="No Wix site connected yet")
    return connection


@router.get("/daily", response_model=list[DailyTrafficOut])
def daily_traffic(
    start: datetime,
    end: datetime,
    db: Session = Depends(get_db),
) -> list[DailyTrafficOut]:
    """One row per day in [start, end], summed across all pages -- feeds
    the traffic line chart. Includes that day's form-submission count so
    the frontend can show both without a second round trip."""
    connection = _current_connection(db)

    traffic_rows = (
        db.query(
            WebsiteDailyTraffic.date,
            func.sum(WebsiteDailyTraffic.sessions).label("sessions"),
            func.sum(WebsiteDailyTraffic.views).label("views"),
            func.sum(WebsiteDailyTraffic.visitors).label("visitors"),
        )
        .filter(
            WebsiteDailyTraffic.connection_id == connection.id,
            WebsiteDailyTraffic.date >= start,
            WebsiteDailyTraffic.date <= end,
        )
        .group_by(WebsiteDailyTraffic.date)
        .all()
    )

    submissions = (
        db.query(WebsiteFormSubmission.submitted_at, WebsiteFormSubmission.form_name)
        .filter(
            WebsiteFormSubmission.connection_id == connection.id,
            WebsiteFormSubmission.submitted_at >= start,
            WebsiteFormSubmission.submitted_at <= end,
        )
        .all()
    )
    # Keyed by day, then by form_name -- "Applications" is a client-side
    # toggle over which form(s) to sum, since Wix returns every form on the
    # site together (see submissions_by_form on DailyTrafficOut).
    submissions_by_date: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for submitted_at, form_name in submissions:
        submissions_by_date[submitted_at.date().isoformat()][form_name or "Unknown form"] += 1

    return [
        DailyTrafficOut(
            date=row.date,
            sessions=row.sessions or 0,
            views=row.views or 0,
            visitors=row.visitors or 0,
            form_submissions=sum(submissions_by_date.get(row.date.date().isoformat(), {}).values()),
            submissions_by_form=dict(submissions_by_date.get(row.date.date().isoformat(), {})),
        )
        for row in sorted(traffic_rows, key=lambda r: r.date)
    ]


@router.get("/top-pages", response_model=list[TopPageOut])
def top_pages(
    start: datetime,
    end: datetime,
    limit: int = Query(default=10, le=100),
    db: Session = Depends(get_db),
) -> list[TopPageOut]:
    connection = _current_connection(db)

    rows = (
        db.query(
            WebsiteDailyTraffic.page_path,
            func.sum(WebsiteDailyTraffic.sessions).label("sessions"),
            func.sum(WebsiteDailyTraffic.views).label("views"),
        )
        .filter(
            WebsiteDailyTraffic.connection_id == connection.id,
            WebsiteDailyTraffic.date >= start,
            WebsiteDailyTraffic.date <= end,
        )
        .group_by(WebsiteDailyTraffic.page_path)
        .order_by(func.sum(WebsiteDailyTraffic.views).desc())
        .limit(limit)
        .all()
    )
    return [TopPageOut(page_path=row.page_path, sessions=row.sessions or 0, views=row.views or 0) for row in rows]


@router.get("/form-submissions", response_model=list[FormSubmissionOut])
def form_submissions(
    start: datetime,
    end: datetime,
    db: Session = Depends(get_db),
) -> list[FormSubmissionOut]:
    connection = _current_connection(db)

    rows = (
        db.query(WebsiteFormSubmission)
        .filter(
            WebsiteFormSubmission.connection_id == connection.id,
            WebsiteFormSubmission.submitted_at >= start,
            WebsiteFormSubmission.submitted_at <= end,
        )
        .order_by(WebsiteFormSubmission.submitted_at.desc())
        .all()
    )
    return [FormSubmissionOut.model_validate(row) for row in rows]


@router.get("/form-names")
def form_names(db: Session = Depends(get_db)) -> list[str]:
    """Distinct form_name values seen across all synced submissions -- lets
    the frontend build a toggle for which form(s) count as "applications",
    since Wix's forms-actions model returns every form on the site together."""
    connection = _current_connection(db)
    rows = (
        db.query(WebsiteFormSubmission.form_name)
        .filter(WebsiteFormSubmission.connection_id == connection.id)
        .distinct()
        .all()
    )
    return sorted({name for (name,) in rows if name})


@router.get("/form-schema", response_model=list[FormSchemaOut])
def form_schemas(db: Session = Depends(get_db)) -> list[FormSchemaOut]:
    """Every synced form's question labels/types/options, keyed by
    form_id -- pairs with a submission's raw `fields` map (keyed by the
    cryptic field target, e.g. "how_d_you_hear_of_us") so the frontend can
    show the real question text instead of the raw key."""
    connection = _current_connection(db)
    rows = db.query(WixFormSchema).filter(WixFormSchema.connection_id == connection.id).all()
    return [FormSchemaOut.model_validate(row) for row in rows]
