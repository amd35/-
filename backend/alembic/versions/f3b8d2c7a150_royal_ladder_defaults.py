"""scale the default royal ladder to the gem pack ladder

The five levels were seeded with 500 / 2 000 / 6 000 / 15 000 points, which the
requested gem packs (7 → 700 royal points each) could not reach. The new
defaults are 100 / 500 / 2 000 / 7 000, so the ladder is reachable while the
levels stay editable from the admin panel.

Only rows still holding the old *default* are touched: a threshold an
administrator changed by hand is never overwritten.

Revision ID: f3b8d2c7a150
Revises: e7a4c1f60d92
Create Date: 2026-10-25 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3b8d2c7a150"
down_revision: Union[str, None] = "e7a4c1f60d92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (level, old default, new default)
LADDER = [(2, 500, 100), (3, 2000, 500), (4, 6000, 2000), (5, 15000, 7000)]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "royal_tiers" not in inspector.get_table_names():
        return
    for level, old, new in LADDER:
        op.execute(
            sa.text(
                "UPDATE royal_tiers SET required_points = :new "
                "WHERE level = :level AND required_points = :old"
            ).bindparams(new=new, level=level, old=old)
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "royal_tiers" not in inspector.get_table_names():
        return
    for level, old, new in LADDER:
        op.execute(
            sa.text(
                "UPDATE royal_tiers SET required_points = :old "
                "WHERE level = :level AND required_points = :new"
            ).bindparams(old=old, level=level, new=new)
        )
