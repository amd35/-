"""games: ludo and domino tables

Revision ID: 8b7f1c0d42aa
Revises: 49c984fe6c31
Create Date: 2026-10-25 09:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8b7f1c0d42aa"
down_revision: Union[str, None] = "49c984fe6c31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_rooms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("host_id", sa.Integer(), nullable=False),
        sa.Column("max_players", sa.Integer(), nullable=False),
        sa.Column("is_private", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("winner_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["host_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["winner_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_game_rooms_host_id", "game_rooms", ["host_id"])
    op.create_index("ix_game_rooms_created_at", "game_rooms", ["created_at"])

    op.create_table(
        "game_players",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game_room_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("seat", sa.Integer(), nullable=False),
        sa.Column("ready", sa.Boolean(), nullable=False),
        sa.Column("connected", sa.Boolean(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["game_room_id"], ["game_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_room_id", "user_id", name="uq_game_player"),
        sa.UniqueConstraint("game_room_id", "seat", name="uq_game_seat"),
    )
    op.create_index("ix_game_players_game_room_id", "game_players", ["game_room_id"])
    op.create_index("ix_game_players_user_id", "game_players", ["user_id"])

    op.create_table(
        "game_moves",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game_room_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["game_room_id"], ["game_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_game_moves_game_room_id", "game_moves", ["game_room_id"])
    op.create_index("ix_game_moves_created_at", "game_moves", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_game_moves_created_at", table_name="game_moves")
    op.drop_index("ix_game_moves_game_room_id", table_name="game_moves")
    op.drop_table("game_moves")
    op.drop_index("ix_game_players_user_id", table_name="game_players")
    op.drop_index("ix_game_players_game_room_id", table_name="game_players")
    op.drop_table("game_players")
    op.drop_index("ix_game_rooms_created_at", table_name="game_rooms")
    op.drop_index("ix_game_rooms_host_id", table_name="game_rooms")
    op.drop_table("game_rooms")
