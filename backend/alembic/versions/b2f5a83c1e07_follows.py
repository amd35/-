"""follows: علاقة متابعة أحادية الاتجاه

Revision ID: b2f5a83c1e07
Revises: b7d4e2a91c30
Create Date: 2026-10-25 21:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2f5a83c1e07"
down_revision: Union[str, None] = "b7d4e2a91c30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "follows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("followed_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["followed_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "followed_user_id", name="uq_follow"),
    )
    op.create_index(op.f("ix_follows_user_id"), "follows", ["user_id"])
    op.create_index(op.f("ix_follows_followed_user_id"), "follows", ["followed_user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_follows_followed_user_id"), table_name="follows")
    op.drop_index(op.f("ix_follows_user_id"), table_name="follows")
    op.drop_table("follows")
