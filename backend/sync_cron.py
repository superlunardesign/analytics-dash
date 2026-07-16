"""Entrypoint for the scheduled sync job (Render Cron Job).

Usage: python sync_cron.py
Iterates every connected account and runs the platform-appropriate sync.
Exits non-zero if any account failed, so the Render cron job surfaces
failures.
"""

from __future__ import annotations

import logging
import sys

from app.db.models import Account, Platform, WixConnection
from app.db.session import SessionLocal
from app.services.instagram_sync import SyncAlreadyRunningError, sync_instagram_account
from app.services.wix_sync import WixSyncAlreadyRunningError, sync_wix_connection

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
            except SyncAlreadyRunningError as exc:
                # Not a failure -- a manual "Sync now" (or the previous
                # scheduled run, if it's taking a while) is already in
                # flight for this account. Just skip and let it finish.
                logger.info("Skipping account %s: %s", account.id, exc)
            except Exception:
                had_failure = True
                logger.exception("Sync failed for account %s", account.id)

        wix_connections = db.query(WixConnection).all()
        for connection in wix_connections:
            logger.info("Syncing Wix site connection %s", connection.id)
            try:
                run = sync_wix_connection(db, connection)
                logger.info("Synced %s rows for Wix connection %s", run.rows_synced, connection.id)
            except WixSyncAlreadyRunningError as exc:
                logger.info("Skipping Wix connection %s: %s", connection.id, exc)
            except Exception:
                had_failure = True
                logger.exception("Sync failed for Wix connection %s", connection.id)
    finally:
        db.close()

    return 1 if had_failure else 0


if __name__ == "__main__":
    sys.exit(main())
