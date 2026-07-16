"""wix form submission details and schema cache

Revision ID: 9a2b7e4f1c6d
Revises: 8f3a1c9d2b4e
Create Date: 2026-07-16 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a2b7e4f1c6d"
down_revision: Union[str, None] = "8f3a1c9d2b4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Switching the population source from the forms-actions semantic
    # model to Wix's Form Submission API (see wix_sync.py/forms_client.py)
    # -- that API has a real per-submission ID, so the old composite
    # natural-key constraint no longer applies. Existing rows have no
    # wix_submission_id and will be fully replaced by the next sync
    # (a full resync is required anyway to pick up the new fields), so
    # clear them out rather than leave stale, field-less rows behind.
    with op.batch_alter_table("website_form_submissions") as batch_op:
        batch_op.drop_constraint("uq_form_submission_natural_key", type_="unique")

    op.execute("DELETE FROM website_form_submissions")

    with op.batch_alter_table("website_form_submissions") as batch_op:
        batch_op.add_column(sa.Column("wix_submission_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("wix_form_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("fields", sa.JSON(), nullable=False, server_default="{}"))
        batch_op.create_unique_constraint("uq_form_submission_wix_id", ["wix_submission_id"])
        batch_op.create_index("ix_website_form_submissions_wix_submission_id", ["wix_submission_id"])
        batch_op.create_index("ix_website_form_submissions_wix_form_id", ["wix_form_id"])

    op.create_table(
        "wix_form_schemas",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("connection_id", sa.String(), sa.ForeignKey("wix_connections.id"), nullable=False),
        sa.Column("form_id", sa.String(), nullable=False),
        sa.Column("form_name", sa.String(), nullable=True),
        sa.Column("fields", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("connection_id", "form_id", name="uq_form_schema_connection_form"),
    )


def downgrade() -> None:
    op.drop_table("wix_form_schemas")
    with op.batch_alter_table("website_form_submissions") as batch_op:
        batch_op.drop_index("ix_website_form_submissions_wix_form_id")
        batch_op.drop_index("ix_website_form_submissions_wix_submission_id")
        batch_op.drop_constraint("uq_form_submission_wix_id", type_="unique")
        batch_op.drop_column("fields")
        batch_op.drop_column("status")
        batch_op.drop_column("wix_form_id")
        batch_op.drop_column("wix_submission_id")
    with op.batch_alter_table("website_form_submissions") as batch_op:
        batch_op.create_unique_constraint(
            "uq_form_submission_natural_key", ["connection_id", "submitted_at", "form_name", "contact_email"]
        )
