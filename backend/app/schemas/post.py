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

    # Manual corrections for metrics Instagram's API never returns for
    # Reels (profile visits, bio link taps, follows). Kept separate from
    # latest_metrics so the API is honest about what Instagram actually
    # reported vs. what was entered by hand; the frontend prefers these
    # over latest_metrics' values when present, and sorting does the same.
    manual_profile_visits: int | None = None
    manual_bio_link_taps: int | None = None
    manual_follows: int | None = None

    is_saved: bool = False


class PostDetailOut(PostOut):
    metric_history: list[MetricSnapshotOut] = []


class PostListResponse(BaseModel):
    total: int
    items: list[PostOut]


class ManualMetricsIn(BaseModel):
    profile_visits: int | None = None
    bio_link_taps: int | None = None
    follows: int | None = None


class SavedIn(BaseModel):
    is_saved: bool


class VideoAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    post_id: str
    external_analysis_id: int
    status: str
    goal: str | None = None
    # Mirrors the analyzer's raw analysis_data verbatim (scores,
    # what_this_video_is, why_it_performed, improvements, transcript,
    # hook breakdowns, etc.) -- see PostVideoAnalysis in models.py.
    raw_payload: dict = {}
    error_message: str | None = None
    requested_at: datetime
    completed_at: datetime | None = None


class AnalyzeVideoIn(BaseModel):
    # One of viral_reach (default), sales_conversions, follower_growth,
    # lead_generation, engagement -- see the Video Analyzer's own
    # trigger_analysis docs. Left unvalidated here since the analyzer
    # itself falls back to "viral_reach" for anything blank/unrecognized.
    goal: str = ""
    # Bypasses the "already completed" short-circuit to request a
    # genuinely fresh run (the drawer's "Re-analyze" button) -- without
    # this, a completed analysis is always served from cache.
    force: bool = False
