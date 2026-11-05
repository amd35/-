"""«الماس» بديل «الكوين»: عملتان فقط في المحفظة (ذهب وماس)

- أرصدة الكوين تنتقل إلى عمود الماس (``diamonds = diamonds + coins``) ثم يُحذف
  العمود — لا يُصفَّر رصيد أحد ولا تُحذف أي حركة من السجل.
- كل حركة أو طلب يحمل عملة «coins» يصبح «diamonds» في السجل، طلبات الشحن،
  الهدايا وطلبات السحب.
- أعمدة أسعار الهدايا وعناصر متجر الزينة تُعاد تسميتها ``price_coins`` →
  ``price_diamonds`` بنفس القيم، فلا يتغير سعر أي عنصر.
- مفاتيح الإعدادات تنتقل إلى أسماء الماس (الحد الأدنى للسحب، مكافأة الترحيب،
  مكافأة الفوز) بنفس القيم التي عدّلها المشرف.

Revision ID: c5f8a31d7b06
Revises: b4e2d17ca930
Create Date: 2026-10-25 15:40:00.000000

"""
import json
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c5f8a31d7b06"
down_revision: Union[str, None] = "b4e2d17ca930"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURRENCY_TABLES = ("ledger_entries", "recharge_orders", "gift_transactions", "withdraw_requests")
PRICE_TABLES = ("gifts", "store_items")
SETTING_KEYS = (
    ("withdrawal_min_coins", "withdrawal_min_diamonds"),
    ("welcome_bonus_coins", "welcome_bonus_diamonds"),
    ("game_win_reward_coins", "game_win_reward_diamonds"),
)


COIN_WORDS = (("كوينات", "ماسات"), ("كوين", "ماس"))


def _columns(inspector: sa.Inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def _swap_coin_words(node: Any) -> Any:
    """يستبدل «كوين/كوينات» بـ«ماس/ماسات» داخل نصوص الإعلانات والعروض المحفوظة."""
    if isinstance(node, str):
        for old, new in COIN_WORDS:
            node = node.replace(old, new)
        return node
    if isinstance(node, list):
        return [_swap_coin_words(item) for item in node]
    if isinstance(node, dict):
        return {key: _swap_coin_words(value) for key, value in node.items()}
    return node


def _rename_coin_copy(bind: sa.engine.Connection) -> None:
    rows = bind.execute(
        sa.text("SELECT key, value FROM app_settings WHERE key IN ('ads', 'offers')")
    ).fetchall()
    for key, value in rows:
        swapped = _swap_coin_words(value)
        if swapped == value:
            continue
        bind.execute(
            sa.text("UPDATE app_settings SET value = CAST(:value AS JSON) WHERE key = :key").bindparams(
                value=json.dumps(swapped, ensure_ascii=False), key=key
            )
        )


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "wallets" in tables and "coins" in _columns(inspector, "wallets"):
        op.execute(sa.text("UPDATE wallets SET diamonds = diamonds + coins"))
        op.drop_column("wallets", "coins")

    for table in CURRENCY_TABLES:
        if table in tables:
            op.execute(sa.text(f"UPDATE {table} SET currency = 'diamonds' WHERE currency = 'coins'"))

    for table in PRICE_TABLES:
        if table in tables and "price_coins" in _columns(inspector, table):
            op.alter_column(
                table,
                "price_coins",
                new_column_name="price_diamonds",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )

    if "app_settings" in tables:
        for old, new in SETTING_KEYS:
            op.execute(
                sa.text(
                    "UPDATE app_settings SET key = :new WHERE key = :old "
                    "AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = :new)"
                ).bindparams(old=old, new=new)
            )
        # نص الإعلانات والعروض المحفوظ في قاعدة البيانات كان يذكر «كوين».
        _rename_coin_copy(op.get_bind())

    # باقات الكوين القديمة لم تعد عملة موجودة: تُبطَّل (لا تُحذف) فلا تظهر في المتجر.
    if "store_packs" in tables:
        op.execute(sa.text("UPDATE store_packs SET active = false WHERE kind = 'coins'"))


def downgrade() -> None:
    """يعيد البنية فقط: الأرصدة التي انتقلت إلى الماس لا يمكن فصلها مرة أخرى."""
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "store_packs" in tables:
        op.execute(sa.text("UPDATE store_packs SET active = true WHERE kind = 'coins'"))

    if "app_settings" in tables:
        for old, new in SETTING_KEYS:
            op.execute(
                sa.text(
                    "UPDATE app_settings SET key = :old WHERE key = :new "
                    "AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = :old)"
                ).bindparams(old=old, new=new)
            )

    for table in PRICE_TABLES:
        if table in tables and "price_diamonds" in _columns(inspector, table):
            op.alter_column(
                table,
                "price_diamonds",
                new_column_name="price_coins",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )

    if "wallets" in tables and "coins" not in _columns(inspector, "wallets"):
        op.add_column("wallets", sa.Column("coins", sa.Integer(), nullable=False, server_default="0"))
