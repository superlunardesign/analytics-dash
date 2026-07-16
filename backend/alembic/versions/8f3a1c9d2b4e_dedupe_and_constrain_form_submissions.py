"""dedupe and constrain form submissions

Revision ID: 8f3a1c9d2b4e
Revises: 1183dec891b9
Create Date: 2026-07-16 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8f3a1c9d2b4e"
down_revision: Union[str, None] = "1183dec891b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The delete-then-reinsert in wix_sync.py's rolling refresh can miss
    # deleting the boundary day's rows (same root cause fixed for
    # WebsiteDailyTraffic -- Wix buckets by calendar day in the site's
    # timezone while the delete filter compares a precise UTC instant), and
    # this table had no constraint to stop it from silently re-inserting
    # the same real submission on every cron cycle. Clean up whatever
    # accumulated before adding the constraint that prevents new ones.
    conn = op.get_bind()
    metadata = sa.MetaData()
    table = sa.Table("website_form_submissions", metadata, autoload_with=conn)

    rows = conn.execute(
        sa.select(
            table.c.id,
            table.c.connection_id,
            table.c.submitted_at,
            table.c.form_name,
            table.c.contact_email,
        ).order_by(table.c.created_at)
    ).fetchall()

    seen: set[tuple] = set()
    duplicate_ids: list[str] = []
    for row in rows:
        key = (row.connection_id, row.submitted_at, row.form_name, row.contact_email)
        if key in seen:
            duplicate_ids.append(row.id)
        else:
            seen.add(key)

    if duplicate_ids:
        conn.execute(table.delete().where(table.c.id.in_(duplicate_ids)))

    # SQLite has no ALTER-a-constraint-on support -- batch mode recreates
    # the table under the hood on that dialect, and is a plain ALTER TABLE
    # on Postgres.
    with op.batch_alter_table("website_form_submissions") as batch_op:
        batch_op.create_unique_constraint(
            "uq_form_submission_natural_key",
            ["connection_id", "submitted_at", "form_name", "contact_email"],
        )


def downgrade() -> None:
    with op.batch_alter_table("website_form_submissions") as batch_op:
        batch_op.drop_constraint("uq_form_submission_natural_key", type_="unique")
