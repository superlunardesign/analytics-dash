from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.db.models import Account, Brand, Platform, Post, PostMetricSnapshot, PostVideoAnalysis
from app.db.session import get_db
from app.integrations.video_analyzer import client as video_analyzer
from app.schemas.post import (
    AnalyzeVideoIn,
    ManualMetricsIn,
    MetricSnapshotOut,
    PostDetailOut,
    PostListResponse,
    PostOut,
    SavedIn,
    VideoAnalysisOut,
)

router = APIRouter(prefix="/api/posts", tags=["posts"])
logger = logging.getLogger(__name__)

SortField = Literal[
    "posted_at",
    "views",
    "comments",
    "saves",
    "shares",
    "watch_time",
    "total_watch_time",
    "profile_visits",
    "bio_link_taps",
    "follows",
    "likes",
    "reach",
    "total_interactions",
]

# Maps a sort key to the PostMetricSnapshot attribute name it sorts by.
# Resolved against the *aliased* snapshot in the query (see
# _latest_snapshot_subquery) rather than the base class, since the query
# joins on a per-post "latest snapshot" alias, not the raw table.
_SORT_ATTR_MAP = {
    "views": "views",
    "comments": "comments",
    "saves": "saves",
    "shares": "shares",
    "watch_time": "avg_watch_time_sec",
    "total_watch_time": "total_watch_time_sec",
    "profile_visits": "profile_visits",
    "bio_link_taps": "bio_link_taps",
    "follows": "follows",
    "likes": "likes",
    "reach": "reach",
    "total_interactions": "total_interactions",
}

# These three sort keys have a manual-override column on Post (see
# models.py) that takes precedence over the synced snapshot value when
# present -- Instagram never returns them for Reels at all, so sorting
# needs to reflect whatever was entered by hand, not just leave those
# posts sorting as if the metric were zero/null.
_MANUAL_OVERRIDE_ATTR_MAP = {
    "profile_visits": "manual_profile_visits",
    "bio_link_taps": "manual_bio_link_taps",
    "follows": "manual_follows",
}


def _latest_snapshot_subquery(db: Session):
    latest_per_post = (
        db.query(
            PostMetricSnapshot.post_id.label("post_id"),
            func.max(PostMetricSnapshot.captured_at).label("captured_at"),
        )
        .group_by(PostMetricSnapshot.post_id)
        .subquery()
    )
    latest_snapshot = aliased(PostMetricSnapshot)
    return latest_per_post, latest_snapshot


@router.get("", response_model=PostListResponse)
def list_posts(
    db: Session = Depends(get_db),
    # Which brand's connected accounts to show posts from -- Superlunar's
    # dashboard and Tinasuze's Content Overview each pass their own, so
    # neither ever sees the other's synced content. None (omitted) means
    # "every brand," which no caller in this app actually does -- both
    # always pass theirs explicitly.
    brand: Brand | None = None,
    platform: Platform | None = None,
    media_type: str | None = None,
    media_product_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    is_saved: bool | None = None,
    sort_by: SortField = "posted_at",
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=50, le=200),
    offset: int = 0,
) -> PostListResponse:
    latest_per_post, latest_snapshot = _latest_snapshot_subquery(db)

    query = (
        db.query(Post, latest_snapshot)
        .outerjoin(latest_per_post, latest_per_post.c.post_id == Post.id)
        .outerjoin(
            latest_snapshot,
            (latest_snapshot.post_id == latest_per_post.c.post_id)
            & (latest_snapshot.captured_at == latest_per_post.c.captured_at),
        )
        # Stories expire on Instagram after 24h and aren't meaningful
        # long-term content to track alongside Feed/Reels performance --
        # excluded everywhere in this dashboard, not just the default view.
        .filter(Post.media_product_type != "STORY")
    )

    if brand:
        brand_account_ids = db.query(Account.id).filter(Account.brand == brand)
        query = query.filter(Post.account_id.in_(brand_account_ids))
    if platform:
        query = query.filter(Post.platform == platform)
    if media_type:
        query = query.filter(Post.media_type == media_type)
    if media_product_type:
        query = query.filter(Post.media_product_type == media_product_type)
    if date_from:
        query = query.filter(Post.posted_at >= date_from)
    if date_to:
        query = query.filter(Post.posted_at <= date_to)
    if is_saved is not None:
        query = query.filter(Post.is_saved == is_saved)

    total = query.count()

    if sort_by == "posted_at":
        sort_col = Post.posted_at
    elif sort_by in _MANUAL_OVERRIDE_ATTR_MAP:
        # Prefer the manually-entered value (Reels only) over whatever
        # Instagram's API returned, since for these three metrics it
        # never returns anything for Reels at all -- see models.py.
        sort_col = func.coalesce(
            getattr(Post, _MANUAL_OVERRIDE_ATTR_MAP[sort_by]),
            getattr(latest_snapshot, _SORT_ATTR_MAP[sort_by]),
        )
    else:
        sort_col = getattr(latest_snapshot, _SORT_ATTR_MAP[sort_by])
    sort_col = sort_col.desc() if order == "desc" else sort_col.asc()
    # NULLs (posts with no snapshot yet, or missing this specific metric) always sort last.
    query = query.order_by(sort_col.nulls_last())

    rows = query.offset(offset).limit(limit).all()

    items = [
        PostOut(
            **PostOut.model_validate(post).model_dump(exclude={"latest_metrics"}),
            latest_metrics=MetricSnapshotOut.model_validate(snapshot) if snapshot else None,
        )
        for post, snapshot in rows
    ]
    return PostListResponse(total=total, items=items)


@router.get("/{post_id}", response_model=PostDetailOut)
def get_post(post_id: str, db: Session = Depends(get_db)) -> PostDetailOut:
    post = db.query(Post).filter(Post.id == post_id).one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    history = (
        db.query(PostMetricSnapshot)
        .filter(PostMetricSnapshot.post_id == post_id)
        .order_by(PostMetricSnapshot.captured_at)
        .all()
    )
    latest = history[-1] if history else None

    return PostDetailOut(
        **PostOut.model_validate(post).model_dump(exclude={"latest_metrics"}),
        latest_metrics=MetricSnapshotOut.model_validate(latest) if latest else None,
        metric_history=[MetricSnapshotOut.model_validate(s) for s in history],
    )


# Media types with no real API-provided source for profile visits / bio
# link taps / follows -- Instagram's API never returns these for Reels at
# all (see app/integrations/instagram/client.py), and TikTok's Display
# API doesn't expose them for any post (see
# app/integrations/tiktok/client.py) -- so manual entry is the only way
# to record them for either. Feed posts already get real synced values
# and aren't included here.
_MANUAL_OVERRIDE_MEDIA_TYPES = {"REELS", "TIKTOK"}


@router.put("/{post_id}/manual-metrics", response_model=PostDetailOut)
def set_manual_metrics(post_id: str, payload: ManualMetricsIn, db: Session = Depends(get_db)) -> PostDetailOut:
    """Manually corrects profile visits / bio link taps / follows for a
    post whose platform API has no real source for them -- see
    _MANUAL_OVERRIDE_MEDIA_TYPES."""
    post = db.query(Post).filter(Post.id == post_id).one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if (post.media_product_type or "").upper() not in _MANUAL_OVERRIDE_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Manual metric overrides are only supported for {', '.join(sorted(_MANUAL_OVERRIDE_MEDIA_TYPES))} posts",
        )

    post.manual_profile_visits = payload.profile_visits
    post.manual_bio_link_taps = payload.bio_link_taps
    post.manual_follows = payload.follows
    db.add(post)
    db.commit()
    db.refresh(post)

    return get_post(post_id, db)


@router.put("/{post_id}/saved", response_model=PostDetailOut)
def set_saved(post_id: str, payload: SavedIn, db: Session = Depends(get_db)) -> PostDetailOut:
    """Toggles a post's bookmark state for the dashboard's "Saved" tab."""
    post = db.query(Post).filter(Post.id == post_id).one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    post.is_saved = payload.is_saved
    db.add(post)
    db.commit()
    db.refresh(post)

    return get_post(post_id, db)


def _upsert_from_analyzer_payload(
    db: Session, post_id: str, external_analysis_id: int, data: dict, goal: str | None, row: PostVideoAnalysis | None
) -> PostVideoAnalysis:
    """Writes one analyzer response (see video_analyzer.client._row_to_dict)
    into our cache row, creating it if needed. status='failed' responses
    store `data["error"]` (the analyzer's own fail_analysis() shape) as
    our error_message."""
    if row is None:
        row = PostVideoAnalysis(post_id=post_id, external_analysis_id=external_analysis_id, goal=goal)
    row.external_analysis_id = external_analysis_id
    row.status = data.get("status", "processing")
    row.raw_payload = data
    row.error_message = data.get("error") if row.status == "failed" else None
    if row.status == "completed" and not row.completed_at:
        row.completed_at = datetime.now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _refresh_if_processing(db: Session, row: PostVideoAnalysis) -> PostVideoAnalysis:
    """Re-checks the analyzer's database for a still-processing analysis
    and updates our cache if it has since completed/failed. A no-op read
    for anything already completed/failed -- those never change again."""
    if row.status != "processing":
        return row
    try:
        data = video_analyzer.get_analysis(row.external_analysis_id)
    except Exception:  # noqa: BLE001 -- transient read failure shouldn't break the drawer, just keep showing "processing"
        logger.exception("Failed to refresh video analysis %s for post %s", row.external_analysis_id, row.post_id)
        return row
    if data is None:
        return row
    return _upsert_from_analyzer_payload(db, row.post_id, row.external_analysis_id, data, row.goal, row)


@router.post("/{post_id}/video-analysis", response_model=VideoAnalysisOut)
def analyze_video(post_id: str, payload: AnalyzeVideoIn, db: Session = Depends(get_db)) -> VideoAnalysisOut:
    """Kicks off (or reuses) a Video Analyzer analysis for this post.
    Order of preference, cheapest/fastest first: (1) our own cache, if
    already completed and not forced; (2) an existing analysis for this
    exact video URL in the analyzer's own database, however it got there
    (its web UI, a direct MCP call, an earlier click here); (3) only
    then, trigger a genuinely new analysis (3-9 minute background job on
    that app's server) -- see app/integrations/video_analyzer/client.py.
    `force=true` (the drawer's "Re-analyze" button) skips straight to
    (3): re-reusing the same existing record would just hand back
    identical results."""
    post = db.query(Post).filter(Post.id == post_id).one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if not post.permalink:
        raise HTTPException(status_code=400, detail="This post has no link to analyze")

    existing = db.query(PostVideoAnalysis).filter(PostVideoAnalysis.post_id == post_id).one_or_none()
    if not payload.force:
        if existing and existing.status == "completed":
            return existing
        if existing and existing.status == "processing":
            return _refresh_if_processing(db, existing)

    try:
        if not payload.force:
            found = video_analyzer.find_latest_analysis(post.permalink)
            if found is not None:
                return _upsert_from_analyzer_payload(
                    db, post_id, found["id"], found, payload.goal or None, existing
                )

        triggered = video_analyzer.trigger_analysis(post.permalink, goal=payload.goal)
        return _upsert_from_analyzer_payload(
            db,
            post_id,
            triggered.analysis_id,
            {"status": "processing"},
            payload.goal or None,
            existing,
        )
    except Exception as exc:  # noqa: BLE001 -- surface the failure to the caller
        raise HTTPException(status_code=502, detail=f"Video analysis request failed: {exc}") from exc


@router.get("/{post_id}/video-analysis", response_model=VideoAnalysisOut)
def get_video_analysis(post_id: str, db: Session = Depends(get_db)) -> VideoAnalysisOut:
    """Polled by the drawer while an analysis is in progress; just serves
    the cache once it's completed or failed."""
    row = db.query(PostVideoAnalysis).filter(PostVideoAnalysis.post_id == post_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="This post hasn't been analyzed yet")
    return _refresh_if_processing(db, row)
