from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MetricSnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    captured_at: datetime
    views: int | None = None
    reach: int | None = None
    likes: int | None = None
    comments: int | None = None
    saves: int | None = None
    shares: int | None = None
    total_interactions: int | None = None
    avg_watch_time_sec: float | None = None
    total_watch_time_sec: float | None = None
    profile_visits: int | None = None
    bio_link_taps: int | None = None
    follows: int | None = None
    other_metrics: dict = {}


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    platform: str
    media_type: str | None = None
    media_product_type: str | None = None
    caption: str | None = None
    permalink: str | None = None
    thumbnail_url: str | None = None
    posted_at: datetime | None = None
    topic: str | None = None
    latest_metrics: MetricSnapshotOut | None = None


class PostDetailOut(PostOut):
    metric_history: list[MetricSnapshotOut] = []


class PostListResponse(BaseModel):
    total: int
    items: list[PostOut]
