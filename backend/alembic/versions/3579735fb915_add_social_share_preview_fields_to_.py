"""add social share preview fields to creator pages

Revision ID: 3579735fb915
Revises: 300419a79aa7
Create Date: 2026-11-20 23:38:15.967384

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3579735fb915'
down_revision: Union[str, None] = '300419a79aa7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('creator_pages', sa.Column('og_title', sa.String(), nullable=True))
    op.add_column('creator_pages', sa.Column('og_description', sa.Text(), nullable=True))
    op.add_column('creator_pages', sa.Column('og_image_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('creator_pages', 'og_image_url')
    op.drop_column('creator_pages', 'og_description')
    op.drop_column('creator_pages', 'og_title')
