from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import decrypt_token, encrypt_token
from app.db.models import Account, Platform, Post, PostMetricSnapshot, SyncRun, SyncStatus
from app.integrations.instagram import oauth as ig_oauth
from app.integrations.instagram.client import InstagramAPIError, InstagramClient, InstagramRateLimitError
from app.integrations.instagram.parsing import parse_media_insights, parse_media_timestamp

logger = logging.getLogger(__name__)


class SyncAlreadyRunningError(RuntimeError):
    """Raised when a sync is requested for an account that already has one
    in flight (e.g. the cron job fired while a manual "Sync now" was still
    running). Without this guard, two overlapping runs each do a
    query-then-insert for the same posts and race each other into a
    duplicate-key error."""


# Refresh the long-lived token if it's within this many days of expiring.
# Meta requires the token be >=24h old to refresh, and long-lived tokens
# last 60 days, so a 10-day buffer leaves plenty of margin for a sync job
# that runs every few hours.
TOKEN_REFRESH_BUFFER = timedelta(days=10)

# If a post already has a snapshot newer than this, skip re-fetching its
# insights this run. Instagram's rate limit (~200 calls/hour) means a
# large account can't be fully refreshed in one run; this makes repeated
# runs pick up where the last one left off (posts newest-first) instead
# of re-spending the whole call budget re-fetching the same newest posts
# every time. Kept just under the cron schedule's interval so, once an
# account is caught up, each post still gets refreshed roughly once per
# scheduled run.
RESYNC_STALE_AFTER = timedelta(hours=3)

# A RUNNING sync row older than this is assumed abandoned (e.g. the
# process was killed mid-run by a deploy) rather than genuinely still in
# flight, so a new run is allowed to proceed instead of being blocked
# forever by a row that never got marked finished.
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
        raise SyncAlreadyRunningError(
            f"A sync for this account started at {started_at.isoformat()} is still running."
        )


def _ensure_fresh_token(db: Session, account: Account) -> str:
    access_token = decrypt_token(account.access_token_encrypted)

    expires_at = account.token_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at and (expires_at - datetime.now(timezone.utc)) < TOKEN_REFRESH_BUFFER:
        result = ig_oauth.refresh_long_lived_token(access_token)
        access_token = result.access_token
        account.access_token_encrypted = encrypt_token(access_token)
        if result.expires_in:
            account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=result.expires_in)
        db.add(account)
        db.commit()

    return access_token


def sync_instagram_account(db: Session, account: Account) -> SyncRun:
    if account.platform != Platform.INSTAGRAM:
        raise ValueError(f"Account {account.id} is not an Instagram account")

    _check_no_concurrent_run(db, account)

    run = SyncRun(account_id=account.id, platform=Platform.INSTAGRAM, status=SyncStatus.RUNNING)
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        access_token = _ensure_fresh_token(db, account)
        client = InstagramClient(access_token=access_token)

        # Cheap (paginated, ~1 call per 50 posts) even for large accounts,
        # and iter_all_media already degrades gracefully to a partial list
        # if it gets rate-limited mid-pagination.
        media_items = client.iter_all_media()
        synced = 0
        rate_limited = False

        for item in media_items:
            external_id = item["id"]
            post = (
                db.query(Post)
                .filter(Post.platform == Platform.INSTAGRAM, Post.external_media_id == external_id)
                .one_or_none()
            )
            is_new_post = post is None
            if post is None:
                post = Post(account_id=account.id, platform=Platform.INSTAGRAM, external_media_id=external_id)

            post.media_type = item.get("media_type")
            post.media_product_type = item.get("media_product_type")
            post.caption = item.get("caption")
            post.permalink = item.get("permalink")
            post.thumbnail_url = item.get("thumbnail_url") or item.get("media_url")
            post.posted_at = parse_media_timestamp(item.get("timestamp"))
            post.raw_payload = item
            db.add(post)
            try:
                db.flush()  # ensure post.id is populated for new rows
            except IntegrityError:
                # Another concurrent run (the guard above should normally
                # prevent this, but two requests can still start within
                # the same instant) already inserted this post first.
                # Fall back to updating that row instead of failing.
                db.rollback()
                post = (
                    db.query(Post)
                    .filter(Post.platform == Platform.INSTAGRAM, Post.external_media_id == external_id)
                    .one()
                )
                post.media_type = item.get("media_type")
                post.media_product_type = item.get("media_product_type")
                post.caption = item.get("caption")
                post.permalink = item.get("permalink")
                post.thumbnail_url = item.get("thumbnail_url") or item.get("media_url")
                post.posted_at = parse_media_timestamp(item.get("timestamp"))
                post.raw_payload = item
                db.add(post)
                db.flush()
                is_new_post = False

            if not is_new_post:
                latest = (
                    db.query(PostMetricSnapshot)
                    .filter(PostMetricSnapshot.post_id == post.id)
                    .order_by(PostMetricSnapshot.captured_at.desc())
                    .first()
                )
                if latest and datetime.now(timezone.utc) - latest.captured_at.replace(tzinfo=timezone.utc) < RESYNC_STALE_AFTER:
                    synced += 1
                    continue

            try:
                raw_insights = client.get_media_insights(external_id, post.media_product_type)
                snapshot_fields = parse_media_insights(raw_insights)
            except InstagramRateLimitError:
                # Every remaining call this run will fail the same way --
                # stop here rather than burning through the rest of the
                # list. What's already committed stays; the next scheduled
                # run picks up from here since already-fresh posts above
                # get skipped via the check above.
                rate_limited = True
                break
            except InstagramAPIError as exc:
                logger.warning("Failed to fetch insights for media %s: %s", external_id, exc)
                snapshot_fields = {"other_metrics": {}}

            # Feed/reel like_count and comments_count come straight off the
            # media object too; prefer them when insights didn't return a value.
            snapshot_fields.setdefault("likes", item.get("like_count"))
            snapshot_fields.setdefault("comments", item.get("comments_count"))

            snapshot = PostMetricSnapshot(post_id=post.id, **snapshot_fields)
            db.add(snapshot)
            synced += 1

            # Commit per post rather than once at the end: if this run
            # gets interrupted (rate limit, crash, deploy restart), work
            # already done stays saved instead of rolling back to nothing.
            db.commit()

        run.status = SyncStatus.SUCCESS
        run.posts_synced = synced
        run.finished_at = datetime.now(timezone.utc)
        if rate_limited:
            run.error_message = (
                f"Stopped early after hitting Instagram's rate limit -- synced {synced} of "
                f"{len(media_items)} posts this run. Already-synced posts are skipped next "
                f"time, so the remaining posts will complete over the next few scheduled runs."
            )
        db.add(run)
        db.commit()

    except Exception as exc:  # noqa: BLE001 -- persist any failure onto the audit row
        db.rollback()
        run.status = SyncStatus.FAILED
        run.error_message = str(exc)
        run.finished_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        raise

    return run
