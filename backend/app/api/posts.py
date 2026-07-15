from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.db.models import Platform, Post, PostMetricSnapshot
from app.db.session import get_db
from app.schemas.post import MetricSnapshotOut, PostDetailOut, PostListResponse, PostOut

router = APIRouter(prefix="/api/posts", tags=["posts"])

SortField = Literal[
    "posted_at",
    "views",
    "comments",
    "saves",
    "shares",
    "watch_time",
    "profile_visits",
    "bio_link_taps",
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
    "profile_visits": "profile_visits",
    "bio_link_taps": "bio_link_taps",
    "likes": "likes",
    "reach": "reach",
    "total_interactions": "total_interactions",
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

    total = query.count()

    if sort_by == "posted_at":
        sort_col = Post.posted_at
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
