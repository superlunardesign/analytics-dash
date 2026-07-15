"""Entrypoint for the scheduled sync job (Render Cron Job).

Usage: python sync_cron.py
Iterates every connected account and runs the platform-appropriate sync.
Exits non-zero if any account failed, so the Render cron job surfaces
failures.
"""

from __future__ import annotations

import logging
import sys

from app.db.models import Account, Platform
from app.db.session import SessionLocal
from app.services.instagram_sync import sync_instagram_account

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("sync_cron")


def main() -> int:
    db = SessionLocal()
    had_failure = False
    try:
        accounts = db.query(Account).all()
        if not accounts:
            logger.info("No connected accounts yet -- nothing to sync.")
            return 0

        for account in accounts:
            logger.info("Syncing %s account %s (%s)", account.platform.value, account.id, account.username)
            try:
                if account.platform == Platform.INSTAGRAM:
                    run = sync_instagram_account(db, account)
                    logger.info("Synced %s posts for account %s", run.posts_synced, account.id)
                else:
                    logger.info("Skipping %s account %s: sync not implemented yet", account.platform.value, account.id)
            except Exception:
                had_failure = True
                logger.exception("Sync failed for account %s", account.id)
    finally:
        db.close()

    return 1 if had_failure else 0


if __name__ == "__main__":
    sys.exit(main())
