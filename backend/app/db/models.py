from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Platform(str, enum.Enum):
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"


class Brand(str, enum.Enum):
    """Which of the two brands this app serves a connected account
    belongs to -- Superlunar (the agency's own dashboard) and Tinasuze
    (the creator page builder). Each brand gets its own independent
    Instagram/TikTok connection and synced posts, never mixed together,
    even though they share this one app/database."""

    SUPERLUNAR = "superlunar"
    TINASUZE = "tinasuze"


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
    # Defaults to SUPERLUNAR (server_default too, so every account that
    # existed before this column did -- the agency's own, real, currently-
    # working connections -- keeps behaving exactly as it already did.
    brand: Mapped[Brand] = mapped_column(Enum(Brand), nullable=False, default=Brand.SUPERLUNAR, server_default="SUPERLUNAR")
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

    # Manual overrides for metrics Instagram's API doesn't return for
    # Reels at all (profile visits, bio link taps, new follows are only
    # available for Feed posts -- see app/integrations/instagram/client.py).
    # Populated by hand from what the creator sees in Instagram's own app,
    # not by any sync. Take precedence over the synced snapshot value when
    # present; see app/api/posts.py.
    manual_profile_visits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manual_bio_link_taps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manual_follows: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # User-curated bookmark, toggled from the dashboard -- lets a "Saved"
    # tab show a stable collection independent of whatever sort/filter/date
    # window the main posts table happens to be showing.
    is_saved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")

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


class PostVideoAnalysis(Base):
    """Cached result from the separate Video Analyzer app, one row per
    Post (the "Analyze" button in the post drawer). Kept as a local cache
    -- not queried live on every drawer open -- for the same reason every
    other integration here caches: avoids a round trip (here, a
    cross-database query) on every view, and keeps working even if that
    app's database becomes unreachable later.

    external_analysis_id is that app's own Analysis.id (its database is
    the source of truth; see app/integrations/video_analyzer/client.py).
    raw_payload mirrors its analysis_data JSON blob verbatim rather than
    being decomposed into columns -- that schema is large, nested, and
    not ours to own; the frontend reads straight from it.
    """

    __tablename__ = "post_video_analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    post_id: Mapped[str] = mapped_column(String, ForeignKey("posts.id"), nullable=False, unique=True)
    external_analysis_id: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="processing")
    goal: Mapped[str | None] = mapped_column(String, nullable=True)

    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    post: Mapped[Post] = relationship()


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


class WixConnection(Base):
    """A connected Wix site, authorized via a Wix custom app install.

    Unlike Instagram's user-delegated OAuth, Wix's app-instance model
    means the app itself (app_id/app_secret, in env vars) mints access
    tokens on demand via the client_credentials grant + instance_id --
    there's no per-site access/refresh token to store, just the
    instance_id captured from the "App Instance Installed" webhook when
    the site owner installs the app.
    """

    __tablename__ = "wix_connections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    site_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    instance_id: Mapped[str] = mapped_column(String, nullable=False)
    site_display_name: Mapped[str | None] = mapped_column(String, nullable=True)

    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    sync_runs: Mapped[list["WixSyncRun"]] = relationship(back_populates="connection", cascade="all, delete-orphan")


class WixSyncRun(Base):
    """Audit log of each Wix analytics sync run, mirroring SyncRun for
    Instagram but kept separate since it tracks a WixConnection, not an
    Account -- Wix's site analytics aren't tied to the social-account
    schema at all."""

    __tablename__ = "wix_sync_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    connection_id: Mapped[str] = mapped_column(String, ForeignKey("wix_connections.id"), nullable=False)
    status: Mapped[SyncStatus] = mapped_column(Enum(SyncStatus), default=SyncStatus.RUNNING)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rows_synced: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    connection: Mapped[WixConnection] = relationship(back_populates="sync_runs")


class WebsiteDailyTraffic(Base):
    """One row per (date, page path) from Wix's `traffic` semantic model.

    Kept at page-path granularity (not just a daily total) so "top pages
    visited" is a simple GROUP BY over this table, and the line-chart
    total for a day is SUM(sessions) across that day's rows.
    """

    __tablename__ = "website_daily_traffic"
    __table_args__ = (UniqueConstraint("connection_id", "date", "page_path", name="uq_traffic_connection_date_page"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    connection_id: Mapped[str] = mapped_column(String, ForeignKey("wix_connections.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    page_path: Mapped[str | None] = mapped_column(String, nullable=True)

    sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    views: Mapped[int | None] = mapped_column(Integer, nullable=True)
    visitors: Mapped[int | None] = mapped_column(Integer, nullable=True)

    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class WebsiteTrafficSource(Base):
    """One row per (date, referrer category, referrer source, UTM campaign
    ID) from the same `traffic` semantic model as WebsiteDailyTraffic --
    a separate table because it's a different dimensional breakdown of the
    same underlying sessions/views/visitors measures (source, not page),
    not something that can share WebsiteDailyTraffic's (date, page_path)
    grain.

    referrer_category/source cover every visit (categorizes even "direct"
    traffic), while utm_campaign_id/utm_medium are null for anything that
    didn't arrive via a tagged campaign link -- confirmed live against the
    real site: populated for paid_ads/tagged traffic, "_" (stored as null
    here) for everything else. utm_medium in particular carries real,
    meaningful values here (social/paid/mail/organic/newsletter) despite
    Wix's own field metadata flagging it "do not use" -- that warning
    turned out to be overly cautious rather than a sign the field is
    empty, confirmed by actually querying it live rather than trusting
    the doc note at face value. The *other* raw UTM dimensions the
    semantic model exposes (utm_content, utm_term, utm_campaign_source,
    utm_multichannelcampaign) are still deliberately not pulled in here.
    """

    __tablename__ = "website_traffic_sources"
    __table_args__ = (
        UniqueConstraint(
            "connection_id",
            "date",
            "referrer_category",
            "referrer_source",
            "utm_campaign_id",
            "utm_medium",
            name="uq_traffic_source_connection_date_source",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    connection_id: Mapped[str] = mapped_column(String, ForeignKey("wix_connections.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    referrer_category: Mapped[str | None] = mapped_column(String, nullable=True)
    referrer_source: Mapped[str | None] = mapped_column(String, nullable=True)
    utm_campaign_id: Mapped[str | None] = mapped_column(String, nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String, nullable=True)

    sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    views: Mapped[int | None] = mapped_column(Integer, nullable=True)
    visitors: Mapped[int | None] = mapped_column(Integer, nullable=True)

    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class WebsiteFormSubmission(Base):
    """One row per Wix form submission (e.g. a project application).

    Populated from Wix's Form Submission API (not the forms-actions
    semantic model this used originally) -- that API only ever returns
    real completed submissions with a genuine unique ID, no page-view/
    started noise to filter and no day-bucketing ambiguity to dedupe
    around, unlike the analytics model. `wix_submission_id` is that real
    ID, used as the upsert key; `fields` is the raw per-question answers
    keyed by Wix's field target (e.g. "how_d_you_hear_of_us"), meant to be
    read alongside a WixFormSchema row for human-readable labels.
    """

    __tablename__ = "website_form_submissions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    connection_id: Mapped[str] = mapped_column(String, ForeignKey("wix_connections.id"), nullable=False)
    wix_submission_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)
    wix_form_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    form_name: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    # Raw question-answer map from the submission, e.g.
    # {"first_name_dfaf": "Rimma", "how_d_you_hear_of_us": ["Tiktok"]}.
    fields: Mapped[dict] = mapped_column(JSON, default=dict)

    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ElementType(str, enum.Enum):
    BUTTON = "button"
    CARD_LINK = "card_link"
    CAROUSEL = "carousel"
    SOCIAL_LINKS = "social_links"
    TEXT = "text"
    LINE = "line"
    PHOTO = "photo"
    # 1 or 2 image-forward cards side by side -- a photo filling most of the
    # card, an optional badge overlaid on it (e.g. "POPULAR"), and a caption
    # below, each independently linked. See frontend's ElementRenderer.tsx.
    IMAGE_CARD_ROW = "image_card_row"


class CreatorPage(Base):
    """One buildable link-in-bio page (a creator can have several, e.g. a
    main page plus a campaign-specific one). Rendered publicly at
    /p/{slug} once published; everything else here is private-dashboard
    data, never served to a visitor directly."""

    __tablename__ = "creator_pages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    # The @handle shown at the top of the page (e.g. "@tinasuze") -- display
    # only, independent of any social_links entry below.
    handle: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")

    # Background gradient, accent/button colors, etc -- one JSON blob since
    # this is purely cosmetic styling the builder UI owns, never something
    # a query needs to filter/aggregate on.
    theme: Mapped[dict] = mapped_column(JSON, default=dict)

    # Page-level social icon row, e.g. {"instagram": "tinasuze", "tiktok":
    # "tinasuze", "pinterest": "thumbelinaa"}. A SOCIAL_LINKS element just
    # renders this wherever it's placed, so there's one list of accounts
    # to keep current regardless of how many places show them.
    social_links: Mapped[dict] = mapped_column(JSON, default=dict)

    # Amazon Associates tracking tag (e.g. "tinasuze-20"), page-level since
    # it's the same one everywhere -- used to build a carousel's "Add All
    # to Cart" bulk link (see Product.amazon_asin below).
    amazon_associate_tag: Mapped[str | None] = mapped_column(String, nullable=True)

    # Social share preview (the card shown when this page's link is pasted
    # into iMessage/Slack/Instagram/etc) -- deliberately separate from
    # title/avatar_url above, since a creator often wants a wider banner
    # image and a punchier title for a share card than what actually shows
    # at the top of the page itself. Each falls back to title/avatar_url
    # when unset -- see frontend/scripts/inject-social-meta.mjs, which
    # bakes these into the static HTML at build time since social-media
    # link unfurlers don't run this SPA's JavaScript.
    og_title: Mapped[str | None] = mapped_column(String, nullable=True)
    og_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_image_url: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    elements: Mapped[list["PageElement"]] = relationship(
        back_populates="page", cascade="all, delete-orphan", order_by="PageElement.position"
    )


class PageElement(Base):
    """One block on a CreatorPage, in display order (position). config's
    shape depends on element_type -- kept as JSON rather than one column
    per possible field across 7 very different element types (a button's
    label/url/gradient vs. a carousel's heading/product_ids vs. a line's
    style/color have almost nothing in common); see frontend/src/types.ts
    for the shape each type expects."""

    __tablename__ = "page_elements"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(String, ForeignKey("creator_pages.id"), nullable=False, index=True)
    element_type: Mapped[ElementType] = mapped_column(Enum(ElementType), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    page: Mapped[CreatorPage] = relationship(back_populates="elements")


class Product(Base):
    """One affiliate-link product in the catalog, usable across any
    number of CARD_LINK/CAROUSEL elements (their config just references
    product_id(s)) -- not owned by a single page, since the same Amazon
    link might reasonably show up in more than one carousel.

    image_url is whatever actually renders (custom_image_url if the
    creator uploaded/picked one, else og_image_url); kept as its own
    resolved column so every reader doesn't need to know the fallback
    rule, but both source values are kept too so switching back is just a
    write, not a re-fetch."""

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Fetched automatically from the link's og:image (see
    # app/integrations/link_preview.py); overwritten by whichever the
    # creator actually picks/uploads, which resolved image_url reflects.
    og_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    custom_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)

    # Auto-detected from source_url (see app/integrations/amazon.py) --
    # null for anything that isn't a recognizable Amazon product link.
    # Powers a carousel's "Add All to Cart" button: only products with an
    # ASIN here can be included in the bulk-add link.
    amazon_asin: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PageVisit(Base):
    """One visit to a published CreatorPage, logged by the public page
    renderer on load -- powers the "Page Visits" line chart. Deliberately
    minimal (no IP/user-agent capture) since nothing here needs more than
    a daily count."""

    __tablename__ = "page_visits"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(
        String, ForeignKey("creator_pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    visited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    referrer: Mapped[str | None] = mapped_column(String, nullable=True)


class LinkClick(Base):
    """One click on any link/button/product on a published CreatorPage --
    powers "Top Link Clicks" and "Top Products". link_url is stored
    directly (not just inferred from element_id/product_id) so a click
    stays attributable even after the element/product it pointed at is
    later edited or deleted -- hence SET NULL rather than blocking that
    delete."""

    __tablename__ = "link_clicks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(
        String, ForeignKey("creator_pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    element_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("page_elements.id", ondelete="SET NULL"), nullable=True
    )
    product_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    link_url: Mapped[str] = mapped_column(String, nullable=False)
    clicked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)


class WixFormSchema(Base):
    """Cached field-label schema for one Wix form (from the Form Schema
    API), refreshed on every sync. Submission answers are keyed by a
    cryptic field target (e.g. "how_d_you_hear_of_us"); this is what maps
    that back to the actual question text ("How'd you hear of us?") and,
    for choice fields, the option labels -- so the detail drawer can show
    real questions instead of raw field keys."""

    __tablename__ = "wix_form_schemas"
    __table_args__ = (UniqueConstraint("connection_id", "form_id", name="uq_form_schema_connection_form"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    connection_id: Mapped[str] = mapped_column(String, ForeignKey("wix_connections.id"), nullable=False)
    form_id: Mapped[str] = mapped_column(String, nullable=False)
    form_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # List of {target, label, field_type, options: [{label, value}]}.
    fields: Mapped[list] = mapped_column(JSON, default=list)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
