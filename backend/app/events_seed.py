"""بذور نظام الفعاليات: كتالوج الألعاب دائمًا، ومحتوى افتتاحي يُنشأ مرة واحدة فقط."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .events_engine import GAME_CATALOG, iso
from .events_models import (
    EventBanner,
    EventGame,
    EventPrize,
    EventSeedState,
    GameEvent,
)
from .models import now_iso


def seed_events(session: Session) -> None:
    if session.get(EventSeedState, 1) is not None:
        session.commit()
        return

    for item in GAME_CATALOG:
        existing = session.scalar(
            select(EventGame).where(EventGame.key == item["key"])
        )
        if existing is None:
            session.add(EventGame(**item))
    session.flush()

    event_count = session.scalar(select(func.count()).select_from(GameEvent)) or 0
    if event_count == 0:
        now = datetime.now(timezone.utc)

        def stamp(delta: timedelta) -> str:
            return iso(now + delta)

        events = [
            {
                "title": "تحدي الحظ اليومي",
                "kind": "daily",
                "game_key": "lucky_challenge",
                "description": "ارمِ النرد مرة واحدة كل يوم واجمع نقاطًا ترفعك في ترتيب المتصدرين. الجوائز ذهبية تُضاف إلى حسابك بعد اعتماد النتائج.",
                "rules": "ارمِ النرد مرة واحدة. تظهر نتيجتك فورًا ويُحسب ترتيبك بين المشاركين.",
                "conditions": "مشاركة واحدة لكل حساب في اليوم. يُمنع استخدام أكثر من حساب لتحسين الترتيب.",
                "starts_at": stamp(timedelta(hours=-1)),
                "ends_at": stamp(timedelta(hours=20)),
                "entry_fee_gold": 0,
                "winners_count": 3,
                "status": "active",
                "published": True,
                "start_notified": True,
                "prizes": [
                    {"rank": 1, "kind": "gold", "amount": 500, "label": "500 ذهب"},
                    {"rank": 2, "kind": "gold", "amount": 250, "label": "250 ذهب"},
                    {"rank": 3, "kind": "gold", "amount": 100, "label": "100 ذهب"},
                ],
            },
            {
                "title": "عجلة الجوائز الأسبوعية",
                "kind": "weekly",
                "game_key": "prize_wheel",
                "description": "عجلة حظ أسبوعية بجوائز متدرجة حتى الجائزة الكبرى. أدر العجلة وشاهد أين يتوقف المؤشر.",
                "rules": "تدور العجلة على الخادم مرة واحدة. القطاع الذي يتوقف عليه المؤشر يحدد نقاطك.",
                "conditions": "مشاركة واحدة أسبوعيًا. الجوائز تُصرف بعد اعتماد الإدارة للنتائج.",
                "starts_at": stamp(timedelta(hours=-2)),
                "ends_at": stamp(timedelta(days=6)),
                "entry_fee_gold": 0,
                "winners_count": 4,
                "status": "active",
                "published": True,
                "start_notified": True,
                "prizes": [
                    {"rank": 1, "kind": "gold", "amount": 1000, "label": "1000 ذهب"},
                    {"rank": 2, "kind": "gold", "amount": 500, "label": "500 ذهب"},
                    {"rank": 3, "kind": "frame", "amount": 0, "label": "إطار ذهبي حصري"},
                    {"rank": 4, "kind": "gold", "amount": 250, "label": "250 ذهب"},
                ],
            },
            {
                "title": "مسابقة الأسئلة الكبرى",
                "kind": "competition",
                "game_key": "quiz",
                "description": "خمسة أسئلة عامة تُقيَّم على الخادم، مع مكافأة سرعة لمن يجيب أسرع. اختبر معرفتك ونافس على المركز الأول.",
                "rules": "خمسة أسئلة، لكل سؤال إجابة واحدة صحيحة. تُحسب الإجابات ومكافأة السرعة على الخادم.",
                "conditions": "لا يمكن إعادة المشاركة بعد التسليم. أي محاولة تلاعب تُلغي المشاركة.",
                "starts_at": stamp(timedelta(minutes=-30)),
                "ends_at": stamp(timedelta(days=2)),
                "entry_fee_gold": 0,
                "winners_count": 3,
                "status": "active",
                "published": True,
                "start_notified": True,
                "prizes": [
                    {"rank": 1, "kind": "gold", "amount": 1500, "label": "1500 ذهب"},
                    {"rank": 2, "kind": "gold", "amount": 750, "label": "750 ذهب"},
                    {"rank": 3, "kind": "gold", "amount": 300, "label": "300 ذهب"},
                ],
            },
            {
                "title": "صندوق المفاجآت الحصري",
                "kind": "exclusive",
                "game_key": "mystery_box",
                "description": "ثلاثة صناديق وخيار واحد فقط. افتح صندوقك واكتشف المفاجأة قبل انتهاء الفعالية الحصرية.",
                "rules": "اختر صندوقًا واحدًا من ثلاثة. الخادم يكشف المحتوى ويحسب نقاطك.",
                "conditions": "مشاركة واحدة لكل حساب. الفعالية حصرية ولا تُعاد.",
                "starts_at": stamp(timedelta(minutes=-10)),
                "ends_at": stamp(timedelta(days=3)),
                "entry_fee_gold": 0,
                "winners_count": 3,
                "status": "active",
                "published": True,
                "start_notified": True,
                "prizes": [
                    {"rank": 1, "kind": "gold", "amount": 2000, "label": "2000 ذهب"},
                    {"rank": 2, "kind": "gold", "amount": 1000, "label": "1000 ذهب"},
                    {"rank": 3, "kind": "gift", "amount": 0, "label": "هدية مفاجأة"},
                ],
            },
            {
                "title": "تحدي جمع النقاط",
                "kind": "challenge",
                "game_key": "points_challenge",
                "description": "خمس جولات سريعة تجمع فيها أكبر عدد من النقاط. كل جولة تُحسب على الخادم.",
                "rules": "خمس جولات متتالية. مجموع نقاط الجولات هو نتيجتك النهائية.",
                "conditions": "مشاركة واحدة. يُمنع تكرار المحاولة بأكثر من حساب.",
                "starts_at": stamp(timedelta(minutes=-5)),
                "ends_at": stamp(timedelta(days=1)),
                "entry_fee_gold": 0,
                "winners_count": 3,
                "status": "active",
                "published": True,
                "start_notified": True,
                "prizes": [
                    {"rank": 1, "kind": "gold", "amount": 800, "label": "800 ذهب"},
                    {"rank": 2, "kind": "gold", "amount": 400, "label": "400 ذهب"},
                    {"rank": 3, "kind": "coins", "amount": 200, "label": "200 عملة"},
                ],
            },
            {
                "title": "تحدي الفرق — بنفسجي ضد ناري",
                "kind": "occasion",
                "game_key": "group_game",
                "description": "انضم لفريق بنفسجي أو ناري واجمع النقاط لفريقك في ثلاث جولات. الفريق الأقوى يسيطر على الساحة.",
                "rules": "اختر فريقك ثم تُلعب ثلاث جولات تُحسب على الخادم. مجموع نقاطك يضاف لرصيد فريقك.",
                "conditions": "مشاركة واحدة لكل حساب. النتائج تُعتمد بعد انتهاء الفعالية.",
                "starts_at": stamp(timedelta(minutes=-15)),
                "ends_at": stamp(timedelta(days=5)),
                "entry_fee_gold": 0,
                "winners_count": 3,
                "status": "active",
                "published": True,
                "start_notified": True,
                "prizes": [
                    {"rank": 1, "kind": "gold", "amount": 1200, "label": "1200 ذهب"},
                    {"rank": 2, "kind": "gold", "amount": 600, "label": "600 ذهب"},
                    {"rank": 3, "kind": "gold", "amount": 300, "label": "300 ذهب"},
                ],
            },
        ]

        created: list[GameEvent] = []
        for data in events:
            prizes = data.pop("prizes")
            event = GameEvent(
                **data,
                created_at=now_iso(),
                updated_at=now_iso(),
            )
            session.add(event)
            session.flush()
            for prize in prizes:
                session.add(
                    EventPrize(event_id=event.id, created_at=now_iso(), **prize)
                )
            created.append(event)

        session.flush()
        if created:
            session.add_all(
                [
                    EventBanner(
                        title=created[0].title,
                        subtitle="فعالية يومية — ارمِ النرد واربح ذهبًا",
                        media_url=created[0].media_url,
                        media_type=created[0].media_type,
                        link_type="event",
                        link_ref=str(created[0].id),
                        starts_at=created[0].starts_at,
                        ends_at=created[0].ends_at,
                        active=True,
                        sort_order=1,
                        created_at=now_iso(),
                    ),
                    EventBanner(
                        title=created[1].title,
                        subtitle="جوائز أسبوعية حتى 1000 ذهب",
                        media_url=created[1].media_url,
                        media_type=created[1].media_type,
                        link_type="event",
                        link_ref=str(created[1].id),
                        starts_at=created[1].starts_at,
                        ends_at=created[1].ends_at,
                        active=True,
                        sort_order=2,
                        created_at=now_iso(),
                    ),
                    EventBanner(
                        title="متجر يلا فون",
                        subtitle="هدايا وإطارات وتأثيرات مميزة",
                        media_url="",
                        media_type="image",
                        link_type="store",
                        link_ref=None,
                        starts_at=iso(now - timedelta(days=1)),
                        ends_at=None,
                        active=True,
                        sort_order=3,
                        created_at=now_iso(),
                    ),
                ]
            )

    session.add(EventSeedState(id=1, seeded_at=now_iso()))
    session.commit()
