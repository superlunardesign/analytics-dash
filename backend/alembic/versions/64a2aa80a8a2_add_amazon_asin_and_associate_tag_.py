"""add amazon asin and associate tag columns

Revision ID: 64a2aa80a8a2
Revises: f0983ef97222
Create Date: 2026-11-20 23:00:42.143218

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '64a2aa80a8a2'
down_revision: Union[str, None] = 'f0983ef97222'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('creator_pages', sa.Column('amazon_associate_tag', sa.String(), nullable=True))
    op.add_column('products', sa.Column('amazon_asin', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'amazon_asin')
    op.drop_column('creator_pages', 'amazon_associate_tag')
