"""جداول نظام الإعلانات والنشاطات والفعاليات.

كل النتائج والجوائز تُحسب وتُسجّل هنا على الخادم؛ الواجهة لا تكتب رصيدًا ولا نتيجة.
"""

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, now_iso


class EventSeedState(Base):
    """علامة تُثبت أن المحتوى الافتتاحي أُنشئ مرة واحدة، فلا يعود بعد حذفه."""

    __tablename__ = "event_seed_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    seeded_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class EventGame(Base):
    """كتالوج الألعاب المتاحة، والأدمن يفعّل/يوقف كل لعبة."""

    __tablename__ = "event_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(240), default="")
    rules: Mapped[str] = mapped_column(Text, default="")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=60)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class EventBanner(Base):
    """بانر إعلاني في أعلى الرئيسية، مع تاريخ بداية/نهاية وإحصاء مشاهدات ونقرات."""

    __tablename__ = "event_banners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    subtitle: Mapped[str] = mapped_column(String(200), default="")
    media_url: Mapped[str] = mapped_column(String(500), default="")
    media_type: Mapped[str] = mapped_column(String(10), default="image")
    link_type: Mapped[str] = mapped_column(String(20), default="event")
    link_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    starts_at: Mapped[str] = mapped_column(String(40), default=now_iso)
    ends_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    views: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class GameEvent(Base):
    """فعالية/نشاط: يومي، أسبوعي، مسابقة، تحدٍ، مناسبة أو فعالية حصرية."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(140))
    kind: Mapped[str] = mapped_column(String(30), default="daily")
    game_key: Mapped[str] = mapped_column(String(40), default="lucky_challenge")
    description: Mapped[str] = mapped_column(Text, default="")
    media_url: Mapped[str] = mapped_column(String(500), default="")
    media_type: Mapped[str] = mapped_column(String(10), default="image")
    rules: Mapped[str] = mapped_column(Text, default="")
    conditions: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[str] = mapped_column(String(40), default=now_iso)
    ends_at: Mapped[str] = mapped_column(String(40), default=now_iso)
    entry_fee_gold: Mapped[int] = mapped_column(Integer, default=0)
    winners_count: Mapped[int] = mapped_column(Integer, default=3)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    start_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    ending_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class EventPrize(Base):
    """جائزة مركز محدد داخل الفعالية."""

    __tablename__ = "event_prizes"
    __table_args__ = (UniqueConstraint("event_id", "rank", name="uq_event_prize_rank"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    rank: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20), default="gold")
    amount: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class EventParticipation(Base):
    """مشاركة مستخدم واحدة لكل فعالية — القيد الفريد يمنع تكرار المشاركة والمكافأة."""

    __tablename__ = "event_participations"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_participation_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(Integer, default=1, index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="finished")
    team: Mapped[str | None] = mapped_column(String(20), nullable=True)
    state_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)
    finished_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class EventWinner(Base):
    """فائز معتمد: pending ثم approved ثم sent بعد إضافة الجائزة للحساب."""

    __tablename__ = "event_winners"
    __table_args__ = (
        UniqueConstraint("event_id", "rank", name="uq_event_winner_rank"),
        UniqueConstraint("event_id", "user_id", name="uq_event_winner_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    participation_id: Mapped[int | None] = mapped_column(
        ForeignKey("event_participations.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[int] = mapped_column(Integer, default=1, index=True)
    rank: Mapped[int] = mapped_column(Integer)
    prize_id: Mapped[int | None] = mapped_column(
        ForeignKey("event_prizes.id", ondelete="SET NULL"), nullable=True
    )
    prize_kind: Mapped[str] = mapped_column(String(20), default="gold")
    prize_amount: Mapped[int] = mapped_column(Integer, default=0)
    prize_label: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    payout_ref: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)
    approved_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sent_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class EventLedger(Base):
    """سجل مالي لكل مشاركة/فوز/صرف — المرجع فريد لمنع الصرف المزدوج."""

    __tablename__ = "event_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, default=1, index=True)
    event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(20), default="gold")
    amount: Mapped[int] = mapped_column(Integer, default=0)
    balance_after: Mapped[int] = mapped_column(Integer, default=0)
    ref: Mapped[str] = mapped_column(String(120), unique=True)
    detail: Mapped[str] = mapped_column(String(240), default="")
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)
