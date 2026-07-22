"""add post saved flag

Revision ID: b3f6a8c1d9e2
Revises: 9a2b7e4f1c6d
Create Date: 2026-07-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3f6a8c1d9e2"
down_revision: Union[str, None] = "9a2b7e4f1c6d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("posts") as batch_op:
        batch_op.add_column(sa.Column("is_saved", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    with op.batch_alter_table("posts") as batch_op:
        batch_op.drop_column("is_saved")
