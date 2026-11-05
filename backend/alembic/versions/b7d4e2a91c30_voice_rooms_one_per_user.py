"""voice rooms: one open room per user, 12 seats, likes, timed bans

Revision ID: b7d4e2a91c30
Revises: a7c3e91f5d20
Create Date: 2026-10-25 19:10:00.000000

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7d4e2a91c30"
down_revision: Union[str, None] = "a7c3e91f5d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    room_member_columns = {column["name"] for column in inspector.get_columns("room_members")}
    room_ban_columns = {column["name"] for column in inspector.get_columns("room_bans")}
    room_indexes = {index["name"] for index in inspector.get_indexes("rooms")}

    # 1) غرفة واحدة فعّالة لكل مستخدم. الغرف المكرّرة القديمة تُغلق (لا تُحذف) فتبقى
    #    بياناتها، ويبقى الفهرس الجزئي قيداً على مستوى قاعدة البيانات للغرف المفتوحة.
    bind.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT r.id,
                       ROW_NUMBER() OVER (
                           PARTITION BY r.owner_id
                           ORDER BY (SELECT count(*) FROM room_members m WHERE m.room_id = r.id) DESC,
                                    r.id DESC
                       ) AS rn
                FROM rooms r
            )
            UPDATE rooms SET status = 'closed'
            WHERE status = 'open' AND id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )
    if "uq_room_owner_open" not in room_indexes:
        op.create_index(
            "uq_room_owner_open",
            "rooms",
            ["owner_id"],
            unique=True,
            postgresql_where=sa.text("status = 'open'"),
        )

    # 2) منصة صوتية بـ 12 مقعداً لكل غرفة، وإنزال من كان على مقعد خارج النطاق.
    bind.execute(sa.text("UPDATE rooms SET seat_count = 12 WHERE seat_count <> 12"))
    bind.execute(sa.text("UPDATE room_members SET seat_index = NULL, mic_on = false WHERE seat_index >= 12"))
    for room_id, locked in bind.execute(sa.text("SELECT id, locked_seats FROM rooms")).fetchall():
        kept = sorted({int(index) for index in (locked or []) if 0 <= int(index) < 12})
        bind.execute(
            sa.text("UPDATE rooms SET locked_seats = CAST(:locked AS json) WHERE id = :room_id"),
            {"locked": json.dumps(kept), "room_id": room_id},
        )

    # 3) صلاحية الطرد التي يمنحها المالك لمشرفه، وحذف رفع اليد/الموافقة.
    if "can_ban" not in room_member_columns:
        op.add_column(
            "room_members", sa.Column("can_ban", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    if "hand_raised" in room_member_columns:
        op.drop_column("room_members", "hand_raised")
    if "mic_granted" in room_member_columns:
        op.drop_column("room_members", "mic_granted")

    # 4) عقوبات مؤقتة: المدة + السبب + تاريخ الانتهاء المحسوب بتوقيت الخادم.
    if "duration" not in room_ban_columns:
        op.add_column(
            "room_bans", sa.Column("duration", sa.String(length=8), nullable=False, server_default="12mo")
        )
    if "reason" not in room_ban_columns:
        op.add_column(
            "room_bans", sa.Column("reason", sa.String(length=200), nullable=False, server_default="")
        )
    if "expires_at" not in room_ban_columns:
        op.add_column("room_bans", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
        # الحظر القديم كان دائماً بلا نهاية: يُعامل كحظر 12 شهراً من تاريخ تطبيقه.
        bind.execute(
            sa.text(
                "UPDATE room_bans SET expires_at = created_at + interval '365 days' WHERE expires_at IS NULL"
            )
        )
        op.alter_column("room_bans", "expires_at", nullable=False)
        op.create_index("ix_room_bans_expires_at", "room_bans", ["expires_at"])

    # 5) إعجابات الغرف: صف واحد لكل مستخدم في كل غرفة.
    if "room_likes" not in tables:
        op.create_table(
            "room_likes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("room_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("room_id", "user_id", name="uq_room_like"),
        )
        op.create_index("ix_room_likes_room_id", "room_likes", ["room_id"])
        op.create_index("ix_room_likes_user_id", "room_likes", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "room_likes" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("room_likes")}
        for name in ("ix_room_likes_user_id", "ix_room_likes_room_id"):
            if name in indexes:
                op.drop_index(name, table_name="room_likes")
        op.drop_table("room_likes")

    room_ban_columns = {column["name"] for column in inspector.get_columns("room_bans")}
    if "expires_at" in room_ban_columns:
        op.drop_index("ix_room_bans_expires_at", table_name="room_bans")
        op.drop_column("room_bans", "expires_at")
    if "reason" in room_ban_columns:
        op.drop_column("room_bans", "reason")
    if "duration" in room_ban_columns:
        op.drop_column("room_bans", "duration")

    room_member_columns = {column["name"] for column in inspector.get_columns("room_members")}
    if "mic_granted" not in room_member_columns:
        op.add_column(
            "room_members", sa.Column("mic_granted", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    if "hand_raised" not in room_member_columns:
        op.add_column(
            "room_members", sa.Column("hand_raised", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    if "can_ban" in room_member_columns:
        op.drop_column("room_members", "can_ban")

    room_indexes = {index["name"] for index in inspector.get_indexes("rooms")}
    if "uq_room_owner_open" in room_indexes:
        op.drop_index("uq_room_owner_open", table_name="rooms")
