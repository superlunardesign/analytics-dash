from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.db.models import Platform, Post, PostMetricSnapshot
from app.db.session import get_db
from app.schemas.post import ManualMetricsIn, MetricSnapshotOut, PostDetailOut, PostListResponse, PostOut, SavedIn

router = APIRouter(prefix="/api/posts", tags=["posts"])

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
    )

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


@router.put("/{post_id}/manual-metrics", response_model=PostDetailOut)
def set_manual_metrics(post_id: str, payload: ManualMetricsIn, db: Session = Depends(get_db)) -> PostDetailOut:
    """Manually corrects profile visits / bio link taps / follows for a
    Reel -- Instagram's API never returns these for Reels at all (see
    app/integrations/instagram/client.py), so this is the only way to
    record them, e.g. from what's visible in Instagram's own app.
    Restricted to Reels since that's the only case where the API has
    nothing to offer; feed posts already get real synced values.
    """
    post = db.query(Post).filter(Post.id == post_id).one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    if (post.media_product_type or "").upper() != "REELS":
        raise HTTPException(status_code=400, detail="Manual metric overrides are only supported for Reels")

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
