"""add brand to accounts for per-brand instagram tiktok connections

Revision ID: 65bcf99758d9
Revises: b6361893cb4c
Create Date: 2026-11-21 00:23:40.959515

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '65bcf99758d9'
down_revision: Union[str, None] = 'b6361893cb4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BRAND_VALUES = ('SUPERLUNAR', 'TINASUZE')


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        # Unlike at CREATE TABLE time (where SQLAlchemy creates any enum
        # type a column references as part of the same statement), a bare
        # ADD COLUMN on an existing table does NOT implicitly create the
        # Postgres enum type first -- this was missed in the first version
        # of this migration (confirmed by reproducing the exact prod
        # failure locally: psycopg2.errors.UndefinedObject: type "brand"
        # does not exist) and has to be created explicitly before the
        # column can reference it. create_type=False on the column's own
        # type below stops SQLAlchemy from then trying to create it again
        # as part of the ADD COLUMN DDL.
        postgresql.ENUM(*_BRAND_VALUES, name='brand').create(bind, checkfirst=True)
        brand_type = postgresql.ENUM(*_BRAND_VALUES, name='brand', create_type=False)
    else:
        brand_type = sa.Enum(*_BRAND_VALUES, name='brand')
    op.add_column('accounts', sa.Column('brand', brand_type, server_default='SUPERLUNAR', nullable=False))


def downgrade() -> None:
    op.drop_column('accounts', 'brand')
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        postgresql.ENUM(name='brand').drop(bind, checkfirst=True)
