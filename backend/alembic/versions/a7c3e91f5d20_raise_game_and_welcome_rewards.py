"""raise the game win reward and the welcome bonus in diamonds

A win paid 200 diamonds and registration paid a 500 diamond welcome bonus.
Both are now larger — 500 diamonds per win and 1 000 on registration — so the
stored settings of a running installation must move with the new defaults.

Only rows still holding the old *default* are touched: an amount an
administrator changed by hand is never overwritten.

Revision ID: a7c3e91f5d20
Revises: c5f8a31d7b06
Create Date: 2026-10-25 16:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7c3e91f5d20"
down_revision: Union[str, None] = "c5f8a31d7b06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (setting key, old default, new default)
REWARDS = [
    ("welcome_bonus_diamonds", 500, 1000),
    ("game_win_reward_diamonds", 200, 500),
]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "app_settings" not in inspector.get_table_names():
        return
    for key, old, new in REWARDS:
        op.execute(
            sa.text(
                "UPDATE app_settings SET value = CAST(CAST(:new AS text) AS json) "
                "WHERE key = :key AND CAST(value AS text) = CAST(:old AS text)"
            ).bindparams(new=new, key=key, old=old)
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "app_settings" not in inspector.get_table_names():
        return
    for key, old, new in REWARDS:
        op.execute(
            sa.text(
                "UPDATE app_settings SET value = CAST(CAST(:old AS text) AS json) "
                "WHERE key = :key AND CAST(value AS text) = CAST(:new AS text)"
            ).bindparams(old=old, key=key, new=new)
        )
