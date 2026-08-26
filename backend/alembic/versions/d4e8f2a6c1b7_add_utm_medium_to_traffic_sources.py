"""add utm_medium to traffic sources

Revision ID: d4e8f2a6c1b7
Revises: c7d2e5a9f1b3
Create Date: 2026-08-26 17:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e8f2a6c1b7"
down_revision: Union[str, None] = "c7d2e5a9f1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("website_traffic_sources") as batch_op:
        batch_op.add_column(sa.Column("utm_medium", sa.String(), nullable=True))
        batch_op.drop_constraint("uq_traffic_source_connection_date_source", type_="unique")
        batch_op.create_unique_constraint(
            "uq_traffic_source_connection_date_source",
            ["connection_id", "date", "referrer_category", "referrer_source", "utm_campaign_id", "utm_medium"],
        )


def downgrade() -> None:
    with op.batch_alter_table("website_traffic_sources") as batch_op:
        batch_op.drop_constraint("uq_traffic_source_connection_date_source", type_="unique")
        batch_op.create_unique_constraint(
            "uq_traffic_source_connection_date_source",
            ["connection_id", "date", "referrer_category", "referrer_source", "utm_campaign_id"],
        )
        batch_op.drop_column("utm_medium")
