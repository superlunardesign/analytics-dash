"""add brand to accounts for per-brand instagram tiktok connections

Revision ID: 65bcf99758d9
Revises: b6361893cb4c
Create Date: 2026-11-21 00:23:40.959515

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '65bcf99758d9'
down_revision: Union[str, None] = 'b6361893cb4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column('brand', sa.Enum('SUPERLUNAR', 'TINASUZE', name='brand'), server_default='SUPERLUNAR', nullable=False))


def downgrade() -> None:
    op.drop_column('accounts', 'brand')
