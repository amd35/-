"""royal levels replace the old crown (VIP) membership

Adds the gems currency and the royal points ledger, plus the editable Royal
level table. The old crown membership stored its expiry on ``users.vip_until``
and its prices in app_settings keys; both are removed here.

Every step checks what already exists: the application also creates missing
tables from the models on startup (``AUTO_CREATE_TABLES``), so a database that
was already brought forward that way must still migrate cleanly.

Revision ID: e7a4c1f60d92
Revises: d52c8f1a9b30
Create Date: 2026-10-25 15:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e7a4c1f60d92"
down_revision: Union[str, None] = "d52c8f1a9b30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_CROWN_SETTINGS = ("vip_price_usd_cents", "vip_price_coins", "vip_days", "vip_benefits")


def _inspect():
    return sa.inspect(op.get_bind())


def _tables() -> set[str]:
    return set(_inspect().get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in _inspect().get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in _inspect().get_indexes(table)}


def upgrade() -> None:
    tables = _tables()

    # الجواهر: عملة ثالثة في المحفظة (منفصلة عن نقاط رويال).
    if "wallets" in tables and "gems" not in _columns("wallets"):
        op.add_column("wallets", sa.Column("gems", sa.Integer(), nullable=False, server_default="0"))

    # نقاط رويال على العضو.
    if "users" in tables and "royal_points" not in _columns("users"):
        op.add_column("users", sa.Column("royal_points", sa.Integer(), nullable=False, server_default="0"))

    # نقاط الباقة: على الباقة، ونسخة على الطلب (لقطة وقت الشراء).
    if "store_packs" in tables and "royal_points" not in _columns("store_packs"):
        op.add_column("store_packs", sa.Column("royal_points", sa.Integer(), nullable=False, server_default="0"))
    if "recharge_orders" in tables and "royal_points" not in _columns("recharge_orders"):
        op.add_column("recharge_orders", sa.Column("royal_points", sa.Integer(), nullable=False, server_default="0"))

    if "royal_tiers" not in tables:
        op.create_table(
            "royal_tiers",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("level", sa.Integer(), nullable=False),
            sa.Column("name_ar", sa.String(length=32), nullable=False),
            sa.Column("name_en", sa.String(length=32), nullable=False),
            sa.Column("required_points", sa.Integer(), nullable=False),
            sa.Column("accent", sa.String(length=16), nullable=False),
            sa.Column("jewel", sa.String(length=16), nullable=False),
            sa.Column("privileges", sa.JSON(), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("level"),
        )
    if "royal_tiers" in _tables() and "ix_royal_tiers_level" not in _indexes("royal_tiers"):
        op.create_index("ix_royal_tiers_level", "royal_tiers", ["level"], unique=False)

    if "royal_point_entries" not in tables:
        op.create_table(
            "royal_point_entries",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("points", sa.Integer(), nullable=False),
            sa.Column("balance_after", sa.Integer(), nullable=False),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("ref", sa.String(length=96), nullable=True),
            sa.Column("note", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("ref"),
        )
    entries_indexes = _indexes("royal_point_entries")
    if "ix_royal_point_entries_user_id" not in entries_indexes:
        op.create_index("ix_royal_point_entries_user_id", "royal_point_entries", ["user_id"], unique=False)
    if "ix_royal_point_entries_created_at" not in entries_indexes:
        op.create_index("ix_royal_point_entries_created_at", "royal_point_entries", ["created_at"], unique=False)

    # إزالة نظام التاج القديم: لا عمود انتهاء عضوية ولا إعداداته.
    if "users" in _tables() and "vip_until" in _columns("users"):
        op.drop_column("users", "vip_until")
    op.execute(
        sa.text("DELETE FROM app_settings WHERE key IN :keys").bindparams(
            sa.bindparam("keys", value=OLD_CROWN_SETTINGS, expanding=True)
        )
    )


def downgrade() -> None:
    if "users" in _tables() and "vip_until" not in _columns("users"):
        op.add_column("users", sa.Column("vip_until", sa.DateTime(timezone=True), nullable=True))
    if "royal_point_entries" in _tables():
        for index in ("ix_royal_point_entries_created_at", "ix_royal_point_entries_user_id"):
            if index in _indexes("royal_point_entries"):
                op.drop_index(index, table_name="royal_point_entries")
        op.drop_table("royal_point_entries")
    if "royal_tiers" in _tables():
        if "ix_royal_tiers_level" in _indexes("royal_tiers"):
            op.drop_index("ix_royal_tiers_level", table_name="royal_tiers")
        op.drop_table("royal_tiers")
    for table, column in (
        ("recharge_orders", "royal_points"),
        ("store_packs", "royal_points"),
        ("users", "royal_points"),
        ("wallets", "gems"),
    ):
        if table in _tables() and column in _columns(table):
            op.drop_column(table, column)
