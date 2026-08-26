"""add website traffic sources table

Revision ID: c7d2e5a9f1b3
Revises: b3f6a8c1d9e2
Create Date: 2026-07-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d2e5a9f1b3"
down_revision: Union[str, None] = "b3f6a8c1d9e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "website_traffic_sources",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("connection_id", sa.String(), sa.ForeignKey("wix_connections.id"), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("referrer_category", sa.String(), nullable=True),
        sa.Column("referrer_source", sa.String(), nullable=True),
        sa.Column("utm_campaign_id", sa.String(), nullable=True),
        sa.Column("sessions", sa.Integer(), nullable=True),
        sa.Column("views", sa.Integer(), nullable=True),
        sa.Column("visitors", sa.Integer(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "connection_id",
            "date",
            "referrer_category",
            "referrer_source",
            "utm_campaign_id",
            name="uq_traffic_source_connection_date_source",
        ),
    )
    op.create_index(
        "ix_website_traffic_sources_date", "website_traffic_sources", ["date"]
    )


def downgrade() -> None:
    op.drop_index("ix_website_traffic_sources_date", table_name="website_traffic_sources")
    op.drop_table("website_traffic_sources")
