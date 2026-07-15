"""Placeholder for the TikTok integration (phase 2).

Not implemented yet. When this gets built, it should mirror the
Instagram integration's shape:
  - oauth.py: TikTok Login Kit OAuth (https://developers.tiktok.com/doc/login-kit-web)
  - client.py: wraps the TikTok Display API / Content Posting API to list
    videos and pull metrics (views, likes, comments, shares, watch time,
    profile visits from video).
  - Reuses the same `Post` / `PostMetricSnapshot` tables via
    Platform.TIKTOK -- no schema changes needed, see app/db/models.py.

The sync entrypoint (sync_cron.py) already loops over every connected
Account regardless of platform, so wiring in a `sync_tiktok_account()`
in app/services/tiktok_sync.py plus a TikTok branch in sync_cron.py is
the only integration point required once this client exists.
"""

raise NotImplementedError("TikTok integration is not implemented yet -- see module docstring.")
