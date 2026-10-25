"""«الماس» بديل «الجوهرة» + الشحن صار ذهباً وماساً + سلّم رويال الجديد

- عمود المحفظة ``gems`` يصبح ``diamonds``، وسجل الحركات وحزم المتجر تتحول من
  ``gems`` إلى ``diamonds``، واسم الباقات «جوهرة» يصبح «ماس» (الأرصدة نفسها تنتقل،
  لا تُصفَّر ولا تُحذف).
- الشحن صار نوعين فقط (ذهب وماس)، وكل باقة شحن تمنح نقاط رويال؛ لذلك تُبطَّل باقات
  الكوين وباقات الذهب القديمة التي لا تمنح نقاطاً (الصفوف تبقى في لوحة الإدارة
  قابلة للتفعيل — لا تُحذف من قاعدة البيانات).
- العتبات الافتراضية لرويال تصبح 7000 / 14000 / 21000 / 28000 / 35000، ولا تُلمس
  عتبة عدّلها المشرف بيده: نغيّر الصفوف التي ما زالت على القيمة الافتراضية فقط.

Revision ID: b4e2d17ca930
Revises: f3b8d2c7a150
Create Date: 2026-10-25 12:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4e2d17ca930"
down_revision: Union[str, None] = "f3b8d2c7a150"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (level, القيمة الافتراضية السابقة, القيمة الجديدة)
LADDER = [(1, 0, 7000), (2, 100, 14000), (3, 500, 21000), (4, 2000, 28000), (5, 7000, 35000)]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "wallets" in tables:
        columns = {column["name"] for column in inspector.get_columns("wallets")}
        if "gems" in columns and "diamonds" not in columns:
            op.alter_column(
                "wallets",
                "gems",
                new_column_name="diamonds",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )

    # كل جدول يحمل عملة الحركة أو الطلب يتحول مع العملة نفسها، وإلا بقي طلب شحن
    # معلّق يشير إلى عملة «gems» التي لم تعد موجودة ورفض الخادم تأكيده.
    for table in ("ledger_entries", "recharge_orders", "gift_transactions", "withdraw_requests"):
        if table in tables:
            op.execute(sa.text(f"UPDATE {table} SET currency = 'diamonds' WHERE currency = 'gems'"))

    if "store_packs" in tables:
        op.execute(sa.text("UPDATE store_packs SET kind = 'diamonds' WHERE kind = 'gems'"))
        op.execute(
            sa.text("UPDATE store_packs SET name = replace(name, 'جوهرة', 'ماس') WHERE name LIKE '%جوهرة%'")
        )
        op.execute(
            sa.text(
                "UPDATE store_packs SET active = false "
                "WHERE kind = 'coins' OR (kind = 'gold' AND royal_points = 0)"
            )
        )

    if "royal_tiers" in tables:
        for level, old, new in LADDER:
            op.execute(
                sa.text(
                    "UPDATE royal_tiers SET required_points = :new "
                    "WHERE level = :level AND required_points = :old"
                ).bindparams(new=new, level=level, old=old)
            )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "royal_tiers" in tables:
        for level, old, new in LADDER:
            op.execute(
                sa.text(
                    "UPDATE royal_tiers SET required_points = :old "
                    "WHERE level = :level AND required_points = :new"
                ).bindparams(old=old, level=level, new=new)
            )

    if "store_packs" in tables:
        op.execute(sa.text("UPDATE store_packs SET kind = 'gems' WHERE kind = 'diamonds'"))
        op.execute(sa.text("UPDATE store_packs SET name = replace(name, 'ماس', 'جوهرة') WHERE name LIKE '%ماس%'"))
        op.execute(sa.text("UPDATE store_packs SET active = true WHERE kind = 'coins'"))

    for table in ("ledger_entries", "recharge_orders", "gift_transactions", "withdraw_requests"):
        if table in tables:
            op.execute(sa.text(f"UPDATE {table} SET currency = 'gems' WHERE currency = 'diamonds'"))

    if "wallets" in tables:
        columns = {column["name"] for column in inspector.get_columns("wallets")}
        if "diamonds" in columns and "gems" not in columns:
            op.alter_column(
                "wallets",
                "diamonds",
                new_column_name="gems",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )
