"""store items and user inventories

Revision ID: c41b7d0e2f68
Revises: 8b7f1c0d42aa
Create Date: 2026-10-25 12:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c41b7d0e2f68"
down_revision: Union[str, None] = "8b7f1c0d42aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "store_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("name_en", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("price_coins", sa.Integer(), nullable=False),
        sa.Column("price_gold", sa.Integer(), nullable=False),
        sa.Column("image_url", sa.String(length=512), nullable=False),
        sa.Column("accent", sa.String(length=16), nullable=False),
        sa.Column("pips", sa.String(length=16), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("sort", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "user_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("equipped", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["store_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "item_id", name="uq_user_item"),
    )
    op.create_index("ix_user_items_user_id", "user_items", ["user_id"])
    op.create_index("ix_user_items_item_id", "user_items", ["item_id"])


def downgrade() -> None:
    op.drop_index("ix_user_items_item_id", table_name="user_items")
    op.drop_index("ix_user_items_user_id", table_name="user_items")
    op.drop_table("user_items")
    op.drop_table("store_items")
