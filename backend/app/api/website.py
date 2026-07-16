from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import WebsiteDailyTraffic, WebsiteFormSubmission, WixConnection
from app.db.session import get_db
from app.schemas.website import DailyTrafficOut, FormSubmissionOut, TopPageOut

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
        db.query(WebsiteFormSubmission.submitted_at)
        .filter(
            WebsiteFormSubmission.connection_id == connection.id,
            WebsiteFormSubmission.submitted_at >= start,
            WebsiteFormSubmission.submitted_at <= end,
        )
        .all()
    )
    submissions_by_date: dict[str, int] = defaultdict(int)
    for (submitted_at,) in submissions:
        submissions_by_date[submitted_at.date().isoformat()] += 1

    return [
        DailyTrafficOut(
            date=row.date,
            sessions=row.sessions or 0,
            views=row.views or 0,
            visitors=row.visitors or 0,
            form_submissions=submissions_by_date.get(row.date.date().isoformat(), 0),
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
