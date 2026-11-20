"""backfill amazon_asin for existing products

Revision ID: 300419a79aa7
Revises: 64a2aa80a8a2
Create Date: 2026-11-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "300419a79aa7"
down_revision: Union[str, None] = "64a2aa80a8a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # amazon_asin (added in 64a2aa80a8a2) is only ever computed when a
    # product is created or its source_url is edited -- any product added
    # before that migration shipped has it stuck at null forever unless
    # backfilled here, which is exactly why "Add All to Cart" could show
    # 0 eligible products for carousels built before this feature existed.
    from app.integrations.amazon import extract_amazon_asin

    conn = op.get_bind()
    metadata = sa.MetaData()
    table = sa.Table("products", metadata, autoload_with=conn)

    rows = conn.execute(
        sa.select(table.c.id, table.c.source_url).where(table.c.amazon_asin.is_(None))
    ).fetchall()

    for row in rows:
        asin = extract_amazon_asin(row.source_url)
        if asin:
            conn.execute(table.update().where(table.c.id == row.id).values(amazon_asin=asin))


def downgrade() -> None:
    # Nothing to revert -- leaving detected ASINs in place on downgrade is
    # harmless (the column itself is dropped by 64a2aa80a8a2's downgrade).
    pass
