"""support messages sent from the contact page

Revision ID: d52c8f1a9b30
Revises: c41b7d0e2f68
Create Date: 2026-10-25 14:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d52c8f1a9b30"
down_revision: Union[str, None] = "c41b7d0e2f68"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "support_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=120), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("contact", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_support_messages_user_id"), "support_messages", ["user_id"])
    op.create_index(op.f("ix_support_messages_created_at"), "support_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_support_messages_created_at"), table_name="support_messages")
    op.drop_index(op.f("ix_support_messages_user_id"), table_name="support_messages")
    op.drop_table("support_messages")
