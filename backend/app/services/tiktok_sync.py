"""Sync entrypoint for a connected TikTok account.

Much simpler than Instagram's sync: TikTok's video.list already returns
view/like/comment/share counts directly on each video object in one
paginated call (no per-post insights endpoint, so no per-post rate-limit
concern the way Instagram's ~200 calls/hour insights budget forces a
skip-if-recently-synced check) -- every run just re-fetches the full
video list and takes a fresh snapshot of each video's current counts.

See client.py's docstring: the exact TikTok API shapes here haven't been
confirmed against a live call the way the rest of this codebase's
integrations were, so the first real sync is the actual test.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import decrypt_token, encrypt_token
from app.db.models import Account, Platform, Post, PostMetricSnapshot, SyncRun, SyncStatus
from app.integrations.tiktok import oauth as tiktok_oauth
from app.integrations.tiktok.client import TikTokAPIError, TikTokClient

logger = logging.getLogger(__name__)


class TikTokSyncAlreadyRunningError(RuntimeError):
    """Same overlapping-run hazard as Instagram's sync -- see SyncAlreadyRunningError."""


# Refresh the access token if it's within this many hours of expiring.
# Access tokens last ~24h; a 3-hour buffer leaves plenty of margin for a
# sync job that runs every few hours.
TOKEN_REFRESH_BUFFER = timedelta(hours=3)

STALE_RUNNING_AFTER = timedelta(hours=1)


def _check_no_concurrent_run(db: Session, account: Account) -> None:
    existing = (
        db.query(SyncRun)
        .filter(SyncRun.account_id == account.id, SyncRun.status == SyncStatus.RUNNING)
        .order_by(SyncRun.started_at.desc())
        .first()
    )
    if existing is None:
        return
    started_at = existing.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - started_at < STALE_RUNNING_AFTER:
        raise TikTokSyncAlreadyRunningError(
            f"A sync for this account started at {started_at.isoformat()} is still running."
        )


def _ensure_fresh_token(db: Session, account: Account) -> str:
    access_token = decrypt_token(account.access_token_encrypted)

    expires_at = account.token_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at and (expires_at - datetime.now(timezone.utc)) < TOKEN_REFRESH_BUFFER:
        refresh_token = decrypt_token(account.refresh_token_encrypted) if account.refresh_token_encrypted else None
        if not refresh_token:
            return access_token
        result = tiktok_oauth.refresh_access_token(refresh_token)
        access_token = result.access_token
        account.access_token_encrypted = encrypt_token(access_token)
        if result.refresh_token:
            account.refresh_token_encrypted = encrypt_token(result.refresh_token)
        if result.expires_in:
            account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=result.expires_in)
        db.add(account)
        db.commit()

    return access_token


def _parse_create_time(value: int | None) -> datetime | None:
    # TikTok returns create_time as a Unix timestamp (seconds), unlike
    # Instagram's ISO 8601 string.
    if value is None:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc)


def sync_tiktok_account(db: Session, account: Account) -> SyncRun:
    if account.platform != Platform.TIKTOK:
        raise ValueError(f"Account {account.id} is not a TikTok account")

    _check_no_concurrent_run(db, account)

    run = SyncRun(account_id=account.id, platform=Platform.TIKTOK, status=SyncStatus.RUNNING)
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        access_token = _ensure_fresh_token(db, account)
        client = TikTokClient(access_token=access_token)

        videos = client.iter_all_videos()

        synced = 0
        for item in videos:
            external_id = item["id"]
            post = (
                db.query(Post)
                .filter(Post.platform == Platform.TIKTOK, Post.external_media_id == external_id)
                .one_or_none()
            )
            if post is None:
                post = Post(account_id=account.id, platform=Platform.TIKTOK, external_media_id=external_id)

            post.media_type = "VIDEO"
            post.media_product_type = "VIDEO"
            post.caption = item.get("title") or item.get("video_description")
            post.permalink = item.get("share_url")
            post.thumbnail_url = item.get("cover_image_url")
            post.posted_at = _parse_create_time(item.get("create_time"))
            post.raw_payload = item
            db.add(post)
            db.flush()  # ensure post.id is populated for new rows

            snapshot = PostMetricSnapshot(
                post_id=post.id,
                views=item.get("view_count"),
                likes=item.get("like_count"),
                comments=item.get("comment_count"),
                shares=item.get("share_count"),
                other_metrics={"duration_sec": item.get("duration")},
            )
            db.add(snapshot)
            synced += 1
            db.commit()

        run.status = SyncStatus.SUCCESS
        run.posts_synced = synced
        run.finished_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()

    except (TikTokAPIError, Exception) as exc:  # noqa: BLE001 -- persist any failure onto the audit row
        db.rollback()
        run.status = SyncStatus.FAILED
        run.error_message = str(exc)
        run.finished_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        logger.exception("TikTok sync failed for account %s", account.id)
        raise

    return run
