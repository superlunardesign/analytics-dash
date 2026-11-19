"""Client for the separate Video Analyzer app
(https://github.com/superlunardesign/video_analysis_ai).

Unlike every other integration in this codebase, this one isn't a public
third-party API -- it's a sibling app the same account runs on Render,
with its own Postgres database. Reviewed its actual code (app.py,
mcp_server.py, models.py) rather than guessing: there's exactly one
token-authed REST endpoint meant for external callers (POST /api/analyze,
used below to trigger a new analysis), and no equivalent for reading
results -- its own MCP server reads results by connecting straight to its
database (the `analyses` table), not through a REST call. This client
does the same thing for the same reason: it's the one pattern the app's
own author already relies on for anything other than triggering, so it's
the least surprising way to integrate rather than inventing a new one.

If video_analyzer_database_url isn't set, every function here raises
RuntimeError -- this integration is entirely optional, same as Wix/TikTok.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import JSON, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Separate declarative base -- this table belongs to a different app's
# database entirely and must never end up in our own Alembic metadata.
_AnalyzerBase = declarative_base()


class AnalyzerAnalysis(_AnalyzerBase):
    """Mirrors video_analysis_ai's models.py Analysis model exactly
    (table name and columns confirmed by reading that file directly).
    Read-only from here -- this app never writes to this table."""

    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    video_url = Column(String(500))
    video_title = Column(String(500))
    thumbnail_url = Column(Text)
    status = Column(String(20))
    analysis_data = Column(JSON)
    pdf_cache_key = Column(String(32))
    format_fingerprint = Column(JSON)
    created_at = Column(DateTime)
    completed_at = Column(DateTime)


_engine = None
_SessionLocal = None


def _get_session_factory():
    global _engine, _SessionLocal
    if _SessionLocal is not None:
        return _SessionLocal
    settings = get_settings()
    if not settings.video_analyzer_database_url:
        raise RuntimeError(
            "VIDEO_ANALYZER_DATABASE_URL is not set -- the Video Analyzer integration is optional "
            "and disabled until it's configured."
        )
    _engine = create_engine(settings.video_analyzer_database_url, pool_pre_ping=True)
    _SessionLocal = sessionmaker(bind=_engine)
    return _SessionLocal


def _normalize_video_url(url: str) -> str:
    """Matches video_analysis_ai's own normalize_video_url() (app.py) --
    it only strips query params, so this mirrors exactly that rather than
    reimplementing something stricter that could miss real matches."""
    return url.split("?")[0]


def _row_to_dict(row: AnalyzerAnalysis) -> dict[str, Any]:
    data = dict(row.analysis_data or {})
    data["id"] = row.id
    data["video_url"] = row.video_url
    data["video_title"] = row.video_title
    data["status"] = row.status
    data["created_at"] = row.created_at.isoformat() if row.created_at else None
    data["completed_at"] = row.completed_at.isoformat() if row.completed_at else None
    return data


def find_latest_analysis(video_url: str) -> dict[str, Any] | None:
    """Most recent analysis (any status) for this exact video, if one
    already exists -- checked before ever triggering a new one, so
    clicking "Analyze" on a video analyzed any other way (the analyzer's
    own web UI, a direct MCP call) reuses that instead of paying for and
    waiting on a duplicate run."""
    Session = _get_session_factory()
    session = Session()
    try:
        normalized = _normalize_video_url(video_url)
        row = (
            session.query(AnalyzerAnalysis)
            .filter(AnalyzerAnalysis.video_url == normalized)
            .order_by(AnalyzerAnalysis.created_at.desc())
            .first()
        )
        return _row_to_dict(row) if row else None
    finally:
        session.close()


def get_analysis(analysis_id: int) -> dict[str, Any] | None:
    Session = _get_session_factory()
    session = Session()
    try:
        row = session.query(AnalyzerAnalysis).get(analysis_id)
        return _row_to_dict(row) if row else None
    finally:
        session.close()


class VideoAnalyzerAPIError(RuntimeError):
    pass


@dataclass
class TriggerResult:
    analysis_id: int


def trigger_analysis(video_url: str, goal: str = "", view_count: str = "") -> TriggerResult:
    """Starts a new analysis via the app's own /api/analyze endpoint --
    the one REST call this integration makes (everything else reads the
    database directly, see module docstring). The analysis itself runs in
    a background thread on that app's server and typically takes 3-9
    minutes; this call only confirms it started."""
    settings = get_settings()
    if not settings.video_analyzer_app_url or not settings.video_analyzer_auth_token:
        raise RuntimeError(
            "VIDEO_ANALYZER_APP_URL / VIDEO_ANALYZER_AUTH_TOKEN are not set -- the Video Analyzer "
            "integration is optional and disabled until they're configured."
        )
    resp = httpx.post(
        f"{settings.video_analyzer_app_url}/api/analyze",
        json={
            "video_url": video_url,
            "auth_token": settings.video_analyzer_auth_token,
            "goal": goal,
            "view_count": view_count,
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise VideoAnalyzerAPIError(f"Video Analyzer API error on POST /api/analyze (status {resp.status_code}): {resp.text[:2000]}")
    body = resp.json()
    if body.get("status") != "success" or not body.get("analysis_id"):
        raise VideoAnalyzerAPIError(f"Video Analyzer API returned an unexpected body: {body}")
    return TriggerResult(analysis_id=body["analysis_id"])
