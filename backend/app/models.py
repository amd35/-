import datetime as dt

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from .db import Base


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(32), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    phone = Column(String(32), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(64), nullable=False, default="")
    bio = Column(Text, nullable=False, default="")
    avatar_url = Column(String(512), nullable=False, default="")
    gender = Column(String(16), nullable=False, default="")
    country = Column(String(2), nullable=False, default="")
    locale = Column(String(8), nullable=False, default="ar")

    status = Column(String(16), nullable=False, default="active")  # active|suspended|banned|deleted
    is_admin = Column(Boolean, nullable=False, default=False)
    admin_role = Column(String(24), nullable=False, default="")  # owner|admin|moderator|support

    email_verified = Column(Boolean, nullable=False, default=False)
    phone_verified = Column(Boolean, nullable=False, default=False)
    online = Column(Boolean, nullable=False, default=False)
    xp = Column(Integer, nullable=False, default=0)
    # نقاط رويال: تُكتسب من الشحن فقط عبر سجل royal_point_entries،
    # والمستوى الحالي يُشتق منها مقابل عتبات royal_tiers القابلة للتعديل.
    royal_points = Column(Integer, nullable=False, default=0)

    notif_prefs = Column(JSON, nullable=False, default=dict)
    privacy = Column(JSON, nullable=False, default=dict)
    voice_prefs = Column(JSON, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_seen_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    coins = Column(Integer, nullable=False, default=0)
    gold = Column(Integer, nullable=False, default=0)
    gems = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class LedgerEntry(Base):
    """Every balance movement, append-only and reviewable."""

    __tablename__ = "ledger_entries"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    currency = Column(String(8), nullable=False)  # coins|gold
    amount = Column(Integer, nullable=False)  # signed
    balance_after = Column(Integer, nullable=False, default=0)
    kind = Column(String(32), nullable=False)  # reward|gift_sent|gift_received|transfer_in|transfer_out|recharge|withdrawal|admin_adjust|purchase
    ref = Column(String(96), nullable=True, unique=True)
    note = Column(String(255), nullable=False, default="")
    counterparty_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(8), nullable=False)  # email|phone
    purpose = Column(String(16), nullable=False)  # verify|reset
    code_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True)
    name = Column(String(64), nullable=False)
    description = Column(Text, nullable=False, default="")
    image_url = Column(String(512), nullable=False, default="")
    background = Column(String(64), nullable=False, default="sunset")
    rules = Column(Text, nullable=False, default="")
    seat_count = Column(Integer, nullable=False, default=20)
    is_private = Column(Boolean, nullable=False, default=False)
    password_hash = Column(String(255), nullable=True)
    gifts_enabled = Column(Boolean, nullable=False, default=True)
    chat_enabled = Column(Boolean, nullable=False, default=True)
    mic_settings = Column(JSON, nullable=False, default=dict)
    locked_seats = Column(JSON, nullable=False, default=list)
    owner_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="open")  # open|closed
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class RoomMember(Base):
    __tablename__ = "room_members"
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_room_member"),
        UniqueConstraint("room_id", "seat_index", name="uq_room_seat"),
    )

    id = Column(Integer, primary_key=True)
    room_id = Column(ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), nullable=False, default="member")  # owner|moderator|assistant|member
    seat_index = Column(Integer, nullable=True)
    mic_on = Column(Boolean, nullable=False, default=False)
    hand_raised = Column(Boolean, nullable=False, default=False)
    mic_granted = Column(Boolean, nullable=False, default=False)
    muted_by_mod = Column(Boolean, nullable=False, default=False)
    joined_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class RoomBan(Base):
    __tablename__ = "room_bans"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_ban"),)

    id = Column(Integer, primary_key=True)
    room_id = Column(ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    banned_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class RoomMessage(Base):
    __tablename__ = "room_messages"

    id = Column(Integer, primary_key=True)
    room_id = Column(ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(16), nullable=False, default="chat")  # chat|system|gift
    text = Column(Text, nullable=False, default="")
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class Gift(Base):
    __tablename__ = "gifts"

    id = Column(Integer, primary_key=True)
    name = Column(String(64), nullable=False)
    name_en = Column(String(64), nullable=False, default="")
    category = Column(String(16), nullable=False, default="normal")  # normal|premium|luxury
    emoji = Column(String(16), nullable=False, default="🎁")
    animation = Column(String(32), nullable=False, default="pulse")
    price_coins = Column(Integer, nullable=False, default=0)
    price_gold = Column(Integer, nullable=False, default=0)
    target = Column(String(8), nullable=False, default="both")  # user|room|both
    active = Column(Boolean, nullable=False, default=True)
    sort = Column(Integer, nullable=False, default=0)


class GiftTransaction(Base):
    __tablename__ = "gift_transactions"

    id = Column(Integer, primary_key=True)
    gift_id = Column(ForeignKey("gifts.id", ondelete="RESTRICT"), nullable=False)
    sender_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    receiver_id = Column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    room_id = Column(ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True)
    currency = Column(String(8), nullable=False)
    amount = Column(Integer, nullable=False)
    receiver_amount = Column(Integer, nullable=False, default=0)
    idempotency_key = Column(String(96), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class FriendRequest(Base):
    __tablename__ = "friend_requests"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_friend_request"),)

    id = Column(Integer, primary_key=True)
    from_user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    to_user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(String(255), nullable=False, default="")
    status = Column(String(16), nullable=False, default="pending")  # pending|accepted|rejected|cancelled
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uq_friendship"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    friend_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("user_id", "blocked_user_id", name="uq_block"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True)
    sender_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(32), nullable=False)
    title = Column(String(128), nullable=False, default="")
    body = Column(String(512), nullable=False, default="")
    data = Column(JSON, nullable=False, default=dict)
    read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class StorePack(Base):
    __tablename__ = "store_packs"

    id = Column(Integer, primary_key=True)
    kind = Column(String(8), nullable=False)  # coins|gold|gems
    name = Column(String(64), nullable=False)
    amount = Column(Integer, nullable=False)
    bonus = Column(Integer, nullable=False, default=0)
    # نقاط رويال التي تمنحها الباقة عند تأكيد الدفع على الخادم.
    royal_points = Column(Integer, nullable=False, default=0)
    price_iqd = Column(Integer, nullable=False, default=0)
    price_usd_cents = Column(Integer, nullable=False, default=0)
    badge = Column(String(32), nullable=False, default="")
    active = Column(Boolean, nullable=False, default=True)
    sort = Column(Integer, nullable=False, default=0)


class StoreItem(Base):
    """Cosmetic sold inside the app for coins/gold: a dice skin or a board theme."""

    __tablename__ = "store_items"

    id = Column(Integer, primary_key=True)
    kind = Column(String(8), nullable=False)  # dice|theme
    name = Column(String(64), nullable=False)
    name_en = Column(String(64), nullable=False, default="")
    description = Column(String(255), nullable=False, default="")
    price_coins = Column(Integer, nullable=False, default=0)
    price_gold = Column(Integer, nullable=False, default=0)
    image_url = Column(String(512), nullable=False, default="")
    accent = Column(String(16), nullable=False, default="#f4c662")
    pips = Column(String(16), nullable=False, default="#1a1224")
    active = Column(Boolean, nullable=False, default=True)
    sort = Column(Integer, nullable=False, default=0)


class UserItem(Base):
    """Inventory: the cosmetics a user owns and the equipped one per kind."""

    __tablename__ = "user_items"
    __table_args__ = (UniqueConstraint("user_id", "item_id", name="uq_user_item"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(ForeignKey("store_items.id", ondelete="CASCADE"), nullable=False, index=True)
    equipped = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class RoyalTier(Base):
    """A Royal level: its name, the points it needs and the privileges it unlocks.

    Editable from the admin panel. Upgrade rules live here (``required_points``)
    and stay independent from the royal points a member earned by recharging.
    """

    __tablename__ = "royal_tiers"

    id = Column(Integer, primary_key=True)
    level = Column(Integer, unique=True, nullable=False, index=True)
    name_ar = Column(String(32), nullable=False, default="")
    name_en = Column(String(32), nullable=False, default="")
    required_points = Column(Integer, nullable=False, default=0)
    accent = Column(String(16), nullable=False, default="#f4cc44")
    jewel = Column(String(16), nullable=False, default="#45d2ba")
    privileges = Column(JSON, nullable=False, default=list)
    active = Column(Boolean, nullable=False, default=True)


class RoyalPointEntry(Base):
    """Append-only log of royal points — the source of truth for the level.

    ``ref`` is unique, so a repeated payment or a replayed admin action can
    never grant the same points twice.
    """

    __tablename__ = "royal_point_entries"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    points = Column(Integer, nullable=False)  # signed
    balance_after = Column(Integer, nullable=False, default=0)
    kind = Column(String(32), nullable=False, default="recharge")  # recharge|admin_adjust
    ref = Column(String(96), nullable=True, unique=True)
    note = Column(String(255), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class RechargeOrder(Base):
    __tablename__ = "recharge_orders"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    pack_id = Column(ForeignKey("store_packs.id", ondelete="SET NULL"), nullable=True)
    currency = Column(String(8), nullable=False)  # coins|gold|gems
    amount = Column(Integer, nullable=False)
    # نسخة من نقاط رويال الباقة وقت الشراء: لا تتغيّر لو عدّل المشرف الباقة لاحقاً.
    royal_points = Column(Integer, nullable=False, default=0)
    price_amount = Column(Integer, nullable=False)
    price_currency = Column(String(8), nullable=False, default="IQD")
    provider = Column(String(24), nullable=False, default="stripe")
    provider_ref = Column(String(128), nullable=True, unique=True)
    status = Column(String(16), nullable=False, default="pending")  # pending|paid|failed|cancelled
    idempotency_key = Column(String(96), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class WithdrawRequest(Base):
    __tablename__ = "withdraw_requests"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    currency = Column(String(8), nullable=False, default="coins")
    amount = Column(Integer, nullable=False)
    fee = Column(Integer, nullable=False, default=0)
    net_amount = Column(Integer, nullable=False, default=0)
    payout_currency = Column(String(8), nullable=False, default="IQD")
    method = Column(String(32), nullable=False, default="")
    beneficiary = Column(JSON, nullable=False, default=dict)
    status = Column(String(16), nullable=False, default="pending")  # pending|approved|rejected|paid
    admin_note = Column(String(255), nullable=False, default="")
    handled_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    idempotency_key = Column(String(96), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    reporter_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String(16), nullable=False)  # user|room|message
    target_id = Column(Integer, nullable=False)
    reason = Column(String(64), nullable=False)
    details = Column(Text, nullable=False, default="")
    status = Column(String(16), nullable=False, default="open")  # open|reviewing|resolved|rejected
    handled_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class SupportMessage(Base):
    """A support request / feedback message sent by a user to the team."""

    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    topic = Column(String(32), nullable=False, default="general")  # general|bug|payment|abuse|suggestion
    subject = Column(String(120), nullable=False)
    body = Column(Text, nullable=False)
    contact = Column(String(120), nullable=False, default="")
    status = Column(String(16), nullable=False, default="open")  # open|answered|closed
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(64), primary_key=True)
    value = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(64), nullable=False)
    target_type = Column(String(32), nullable=False, default="")
    target_id = Column(String(64), nullable=False, default="")
    details = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class GameRoom(Base):
    """A Ludo or Domino table.

    The authoritative board lives in ``state`` (JSON) and every accepted action
    is appended to ``game_moves``, so a match can be replayed and audited. No
    money is involved: games are pure skill/entertainment.
    """

    __tablename__ = "game_rooms"

    id = Column(Integer, primary_key=True)
    game = Column(String(16), nullable=False)  # ludo|domino
    name = Column(String(64), nullable=False, default="")
    host_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    max_players = Column(Integer, nullable=False, default=4)
    is_private = Column(Boolean, nullable=False, default=False)
    status = Column(String(16), nullable=False, default="waiting")  # waiting|playing|finished|closed
    state = Column(JSON, nullable=False, default=dict)
    config = Column(JSON, nullable=False, default=dict)
    winner_id = Column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    finished_at = Column(DateTime(timezone=True), nullable=True)


class GamePlayer(Base):
    __tablename__ = "game_players"
    __table_args__ = (
        UniqueConstraint("game_room_id", "user_id", name="uq_game_player"),
        UniqueConstraint("game_room_id", "seat", name="uq_game_seat"),
    )

    id = Column(Integer, primary_key=True)
    game_room_id = Column(ForeignKey("game_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seat = Column(Integer, nullable=False, default=0)
    ready = Column(Boolean, nullable=False, default=False)
    connected = Column(Boolean, nullable=False, default=True)
    score = Column(Integer, nullable=False, default=0)
    joined_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class GameMove(Base):
    """Append-only log of accepted game actions (audit + reconnect replay)."""

    __tablename__ = "game_moves"

    id = Column(Integer, primary_key=True)
    game_room_id = Column(ForeignKey("game_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    seq = Column(Integer, nullable=False, default=0)
    kind = Column(String(24), nullable=False)  # roll|move|play|draw|pass|start|round|finish
    payload = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
