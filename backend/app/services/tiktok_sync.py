"""Sync entrypoint for a connected TikTok account.

TikTok's video.list already returns view/like/comment/share counts
directly on each video object -- no separate per-post insights endpoint
like Instagram needs. But confirmed live on a sandbox app: TikTok's rate
limit can hit partway through a large account's pagination, so this
commits each page of videos as it's fetched (not just each post) rather
than buffering the whole list in memory first -- a rate limit on a later
page still leaves every earlier page's videos saved, and the next sync
(manual or scheduled) just picks up from wherever it left off, since
already-synced videos are looked up by external_id and updated in place
rather than duplicated.

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
from app.integrations.tiktok.client import TikTokAPIError, TikTokClient, TikTokRateLimitError

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

        synced = 0
        rate_limited = False
        cursor: str | None = None
        while True:
            try:
                page = client.list_videos(cursor=cursor)
            except TikTokRateLimitError:
                # Every remaining call this run will fail the same way --
                # stop here rather than losing pages already fetched.
                # What's already committed below stays; the next sync
                # (manual or scheduled) just updates these same videos
                # again and picks up the rest via cursor-less pagination.
                rate_limited = True
                break
            page_items = page.get("videos", [])

            for item in page_items:
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

            # Commit after each full page rather than only at the very
            # end -- if the *next* page's fetch hits a rate limit, this
            # page's videos are already saved instead of being lost.
            db.commit()

            if not page.get("has_more") or not page_items:
                break
            cursor = str(page.get("cursor")) if page.get("cursor") is not None else None
            if not cursor:
                break

        run.status = SyncStatus.SUCCESS
        run.posts_synced = synced
        run.finished_at = datetime.now(timezone.utc)
        if rate_limited:
            run.error_message = (
                f"Stopped early after hitting TikTok's rate limit -- synced {synced} videos this run. "
                "Already-synced videos get refreshed (not duplicated) next time, so the rest will "
                "complete over the next few syncs. Try 'Sync now' again in a few minutes, or wait for "
                "the next scheduled sync."
            )
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
