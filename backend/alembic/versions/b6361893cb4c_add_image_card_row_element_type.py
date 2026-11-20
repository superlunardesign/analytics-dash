"""add image_card_row element type

Revision ID: b6361893cb4c
Revises: 3579735fb915
Create Date: 2026-11-21 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "b6361893cb4c"
down_revision: Union[str, None] = "3579735fb915"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # page_elements.element_type is a native Postgres ENUM (SQLAlchemy
    # stores the Python enum MEMBER NAME, not its .value -- "IMAGE_CARD_ROW",
    # not "image_card_row", matching how every existing member was added in
    # f0983ef97222). SQLite has no native enum type at all here (this
    # column is just a VARCHAR there), so this is a no-op on that dialect --
    # a fresh SQLite dev.db already gets every current member for free from
    # the model definition, nothing to alter.
    #
    # Postgres also won't let a value just added by ALTER TYPE be used
    # inside the SAME transaction that added it -- not a concern here since
    # this migration only adds the value, nothing inserts it.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE elementtype ADD VALUE IF NOT EXISTS 'IMAGE_CARD_ROW'")


def downgrade() -> None:
    # Postgres has no "ALTER TYPE ... DROP VALUE" -- removing an enum
    # value requires rebuilding the type from scratch, not worth doing for
    # a downgrade path that would only matter if some row is still using
    # it (which would then have no valid value to fall back to anyway).
    pass
