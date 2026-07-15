"""Placeholder for website-analytics correlation (phase 2).

Not implemented yet. The intended shape:
  - Pull daily traffic-acquisition data from the GA4 Data API
    (https://developers.google.com/analytics/devguides/reporting/data/v1),
    keyed by (date, source, medium, campaign, landing_page), and upsert
    into the `website_sessions` table (see app/db/models.py).
  - Correlate a WebsiteSession to a Post either by:
      1. UTM tagging convention in the bio link (e.g. utm_campaign
         encodes the post id/slug), matched to `linked_post_id`, or
      2. Time-window heuristics (traffic spike shortly after a post's
         `posted_at`) when UTM tagging isn't available.
  - Applies to any platform's posts, not just Instagram -- that's why
    `website_sessions.linked_post_id` points at the shared `posts` table
    rather than an Instagram-specific one.
"""

raise NotImplementedError("Website analytics correlation is not implemented yet -- see module docstring.")
