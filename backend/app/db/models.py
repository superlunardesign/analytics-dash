from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Platform(str, enum.Enum):
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"


class SyncStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class Account(Base):
    """A connected social account. One row per platform per creator."""

    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("platform", "external_account_id", name="uq_account_platform_external_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    platform: Mapped[Platform] = mapped_column(Enum(Platform), nullable=False)
    external_account_id: Mapped[str] = mapped_column(String, nullable=False)
    username: Mapped[str | None] = mapped_column(String, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)

    # OAuth token material, encrypted at rest (see app.core.security).
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Platform-specific extras (e.g. linked Facebook Page id for Instagram).
    extra: Mapped[dict] = mapped_column(JSON, default=dict)

    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    posts: Mapped[list["Post"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    sync_runs: Mapped[list["SyncRun"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Post(Base):
    """A single piece of content (Instagram post/reel/story, future TikTok video)."""

    __tablename__ = "posts"
    __table_args__ = (UniqueConstraint("platform", "external_media_id", name="uq_post_platform_external_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(String, ForeignKey("accounts.id"), nullable=False)
    platform: Mapped[Platform] = mapped_column(Enum(Platform), nullable=False)
    external_media_id: Mapped[str] = mapped_column(String, nullable=False)

    # e.g. IMAGE, VIDEO, CAROUSEL_ALBUM (Instagram media_type)
    media_type: Mapped[str | None] = mapped_column(String, nullable=True)
    # e.g. FEED, REELS, STORY, AD (Instagram media_product_type)
    media_product_type: Mapped[str | None] = mapped_column(String, nullable=True)

    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    permalink: Mapped[str | None] = mapped_column(String, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String, nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Auto-detected topic/category. Populated by a future classification pass; null until then.
    topic: Mapped[str | None] = mapped_column(String, nullable=True)

    # Full raw API payload for the media object, kept so we can backfill new
    # fields later without re-hitting the API.
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    account: Mapped[Account] = relationship(back_populates="posts")
    metric_snapshots: Mapped[list["PostMetricSnapshot"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", order_by="PostMetricSnapshot.captured_at"
    )


class PostMetricSnapshot(Base):
    """A point-in-time read of a post's metrics.

    Instagram's API only ever exposes current cumulative totals, not
    history, so every sync run inserts a new snapshot rather than
    overwriting the last one. This is what lets the dashboard show trends
    later, not just current sort order.
    """

    __tablename__ = "post_metric_snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    post_id: Mapped[str] = mapped_column(String, ForeignKey("posts.id"), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    views: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reach: Mapped[int | None] = mapped_column(Integer, nullable=True)
    likes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    saves: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shares: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_interactions: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Watch-time metrics (Reels / video only).
    avg_watch_time_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_watch_time_sec: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Attributed to this specific post via Instagram's `profile_activity` breakdown.
    profile_visits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bio_link_taps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    follows: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Catch-all for less common / platform-specific metrics (e.g. TikTok
    # equivalents later) so the fixed columns above don't need to grow
    # every time a platform adds a new metric.
    other_metrics: Mapped[dict] = mapped_column(JSON, default=dict)

    post: Mapped[Post] = relationship(back_populates="metric_snapshots")


class SyncRun(Base):
    """Audit log of each sync job execution, for debugging and rate-limit tracking."""

    __tablename__ = "sync_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(String, ForeignKey("accounts.id"), nullable=False)
    platform: Mapped[Platform] = mapped_column(Enum(Platform), nullable=False)
    status: Mapped[SyncStatus] = mapped_column(Enum(SyncStatus), default=SyncStatus.RUNNING)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posts_synced: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    account: Mapped[Account] = relationship(back_populates="sync_runs")


class WebsiteSession(Base):
    """Stub for future website-analytics correlation (e.g. GA4 Data API).

    Not populated by anything yet -- this just reserves the shape so the
    posts <-> website-traffic join doesn't require a schema migration
    later. One row per (date, source, medium, campaign) bucket, matching
    how GA4 reports traffic-acquisition data.
    """

    __tablename__ = "website_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    medium: Mapped[str | None] = mapped_column(String, nullable=True)
    campaign: Mapped[str | None] = mapped_column(String, nullable=True)
    landing_page: Mapped[str | None] = mapped_column(String, nullable=True)

    sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conversions: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Optional explicit link when a UTM tag encodes which post drove the traffic.
    linked_post_id: Mapped[str | None] = mapped_column(String, ForeignKey("posts.id"), nullable=True)

    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
