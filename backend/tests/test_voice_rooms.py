"""Voice rooms: one room per user, direct joining/seating, likes and timed bans."""
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models import RoomBan, utcnow


def _token(account: dict) -> dict:
    return {"Authorization": f"Bearer {account['token']}"}


def _create_room(client, owner, name="غرفة الاختبار", **extra):
    payload = {"name": name, "rules": "احترام الجميع", **extra}
    created = client.post("/api/rooms", json=payload, headers=_token(owner))
    assert created.status_code == 201, created.text
    return created.json()["room"]


def test_room_creation_is_limited_to_one_per_user(client, make_user):
    owner = make_user("oneroomowner")
    room = _create_room(client, owner, "غرفة واحدة")
    assert room["seat_count"] == 12
    assert room["number"] == room["id"]
    assert room["members"][0]["role"] == "owner"

    # المحاولة الثانية مرفوضة حتى لو تغيّر الاسم (القيد على مستوى قاعدة البيانات).
    again = client.post("/api/rooms", json={"name": "غرفة ثانية"}, headers=_token(owner))
    assert again.status_code == 409

    db = SessionLocal()
    try:
        # لا يوجد صفان مفتوحان لنفس المالك: القيد مطبّق في القاعدة لا في الواجهة فقط.
        db.execute(
            __import__("sqlalchemy").text(
                "INSERT INTO rooms (name, description, image_url, background, rules, seat_count, "
                "is_private, gifts_enabled, chat_enabled, mic_settings, locked_seats, owner_id, status, "
                "created_at, updated_at) VALUES ('dup', '', '', 'sunset', '', 12, false, true, true, "
                "'{}'::json, '[]'::json, :owner, 'open', now(), now())"
            ),
            {"owner": owner["user"]["id"]},
        )
    except Exception as exc:  # الفهرس الفريد الجزئي يمنع الصف الثاني
        assert "uq_room_owner_open" in str(exc)
        db.rollback()
    else:
        db.rollback()
        raise AssertionError("قاعدة البيانات سمحت بغرفتين مفتوحتين لنفس المستخدم")
    finally:
        db.close()

    # قائمة الغرف تخبر الواجهة بغرفة المستخدم الواحدة.
    listed = client.get("/api/rooms", headers=_token(owner)).json()
    assert listed["my_room_id"] == room["id"]


def test_room_join_is_direct_and_like_is_unique(client, make_user):
    owner = make_user("directowner")
    member = make_user("directmember")
    room = _create_room(client, owner, "غرفة الانضمام")
    room_id = room["id"]

    joined = client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(member))
    assert joined.status_code == 200
    assert joined.json()["room"]["member_count"] == 2
    # الانضمام المتكرر لا يضيف عضوية مكررة.
    again = client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(member))
    assert again.status_code == 200
    assert again.json()["room"]["member_count"] == 2

    # الصعود إلى مقعد فارغ مباشرة بلا رفع يد ولا موافقة.
    seated = client.post(f"/api/rooms/{room_id}/seats/5/take", headers=_token(member))
    assert seated.status_code == 200, seated.text
    mine = next(
        item for item in seated.json()["room"]["members"] if item["user"]["id"] == member["user"]["id"]
    )
    assert mine["seat_index"] == 5
    assert mine["mic_on"] is False  # المايك مكتوم افتراضياً عند الصعود

    liked = client.post(f"/api/rooms/{room_id}/like", headers=_token(member))
    assert liked.status_code == 200 and liked.json()["liked"] is True
    assert liked.json()["like_count"] == 1
    # إعجاب واحد لكل حساب: الضغط مرة أخرى يلغي الإعجاب بدل تكراره.
    unliked = client.post(f"/api/rooms/{room_id}/like", headers=_token(member))
    assert unliked.json()["liked"] is False and unliked.json()["like_count"] == 0

    detail = client.get(f"/api/rooms/{room_id}", headers=_token(member)).json()["room"]
    assert len(detail["members"]) == 2
    assert all("user" in item and item["user"]["username"] for item in detail["members"])


def test_seats_mic_server_checks_and_full_room(client, make_user):
    owner = make_user("seatsowner")
    member = make_user("memberseat")
    room = _create_room(client, owner, "غرفة المقاعد", seat_count=20)
    room_id = room["id"]
    assert room["seat_count"] == 12  # عدد المقاعد ثابت على الخادم

    client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(member))
    member_id = member["user"]["id"]

    # مايك بدون مقعد مرفوض، وبعد الصعود يفتح المستخدم مايكه بنفسه.
    assert (
        client.post(
            f"/api/rooms/{room_id}/members/{member_id}/mic", json={"value": True}, headers=_token(member)
        ).status_code
        == 400
    )
    assert client.post(f"/api/rooms/{room_id}/seats/2/take", headers=_token(member)).status_code == 200
    assert (
        client.post(
            f"/api/rooms/{room_id}/members/{member_id}/mic", json={"value": True}, headers=_token(member)
        ).status_code
        == 200
    )

    # كتم المشرف يمنع تشغيل المايك مرة أخرى (التحقق على الخادم).
    muted = client.post(
        f"/api/rooms/{room_id}/members/{member_id}/mute", json={"value": True}, headers=_token(owner)
    )
    assert muted.status_code == 200
    assert (
        client.post(
            f"/api/rooms/{room_id}/members/{member_id}/mic", json={"value": True}, headers=_token(member)
        ).status_code
        == 403
    )

    # مقعد واحد لكل مستخدم: الانتقال يحرّر المقعد القديم.
    moved = client.post(f"/api/rooms/{room_id}/seats/3/take", headers=_token(member)).json()["room"]
    seats = [item["seat_index"] for item in moved["members"] if item["user"]["id"] == member_id]
    assert seats == [3]

    # النزول من المقعد يعيده مستمعاً ويوقف المايك.
    released = client.post(f"/api/rooms/{room_id}/seats/3/release", headers=_token(member)).json()["room"]
    after = next(item for item in released["members"] if item["user"]["id"] == member_id)
    assert after["seat_index"] is None and after["mic_on"] is False

    # المقعد المقفل غير متاح، والمقعد المشغول مرفوض.
    assert (
        client.post(
            f"/api/rooms/{room_id}/seats/4/lock", json={"value": True}, headers=_token(owner)
        ).status_code
        == 200
    )
    assert client.post(f"/api/rooms/{room_id}/seats/4/take", headers=_token(member)).status_code == 400
    # مقعد المالك مشغول: لا يمكن الجلوس عليه.
    assert client.post(f"/api/rooms/{room_id}/seats/0/take", headers=_token(member)).status_code == 409

    # امتلاء المنصة: 12 مقعداً، المالك على مقعد 0، ومقعد 4 مقفل.
    for index in (1, 2, 3, 5, 6, 7, 8, 9, 10, 11):
        filler = make_user(f"seatsfiller{index}")
        client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(filler))
        assert client.post(f"/api/rooms/{room_id}/seats/{index}/take", headers=_token(filler)).status_code == 200
    full = client.post(f"/api/rooms/{room_id}/seats/10/take", headers=_token(member))
    assert full.status_code == 409
    assert full.json()["detail"] == "جميع المقاعد مشغولة"

    stats = client.get(f"/api/rooms/{room_id}/stats", headers=_token(owner)).json()
    assert stats["seats"] == 12 and stats["free_seats"] == 0


def test_bans_two_hours_and_twelve_months(client, make_user):
    owner = make_user("banowner")
    moderator = make_user("banmoderator")
    target = make_user("bantarget")
    other = make_user("banother")
    room = _create_room(client, owner, "غرفة العقوبات")
    room_id = room["id"]
    owner_id = owner["user"]["id"]
    target_id = target["user"]["id"]

    for account in (moderator, target, other):
        client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(account))
    client.post(f"/api/rooms/{room_id}/seats/2/take", headers=_token(target))

    # المشرف بلا صلاحية طرد لا يستطيع الحظر.
    client.post(
        f"/api/rooms/{room_id}/members/{moderator['user']['id']}/role",
        json={"role": "moderator"},
        headers=_token(owner),
    )
    assert (
        client.post(
            f"/api/rooms/{room_id}/members/{target_id}/ban",
            json={"duration": "2h", "reason": "إزعاج"},
            headers=_token(moderator),
        ).status_code
        == 403
    )
    # ولا يمكنه طرد المالك بعد منحه الصلاحية.
    client.post(
        f"/api/rooms/{room_id}/members/{moderator['user']['id']}/permissions",
        json={"can_ban": True},
        headers=_token(owner),
    )
    assert (
        client.post(
            f"/api/rooms/{room_id}/members/{owner_id}/ban",
            json={"duration": "2h"},
            headers=_token(moderator),
        ).status_code
        == 400
    )

    banned = client.post(
        f"/api/rooms/{room_id}/members/{target_id}/ban",
        json={"duration": "2h", "reason": "إزعاج متكرر"},
        headers=_token(moderator),
    )
    assert banned.status_code == 200, banned.text
    assert banned.json()["ban"]["duration"] == "2h"
    started = datetime.fromisoformat(banned.json()["ban"]["created_at"])
    expires = datetime.fromisoformat(banned.json()["ban"]["expires_at"])
    assert 1.9 <= (expires - started).total_seconds() / 3600 <= 2.1

    # الإخراج الفوري من الغرفة: العضو لم يعد موجوداً ولا يجلس على مقعد.
    state = banned.json()["room"]
    assert target_id not in [item["user"]["id"] for item in state["members"]]

    # المنع محفوظ في قاعدة البيانات، فلا يُلتف عليه بتحديث الصفحة أو جهاز آخر.
    assert client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(target)).status_code == 403
    db = SessionLocal()
    try:
        row = db.execute(
            select(RoomBan).where(RoomBan.room_id == room_id, RoomBan.user_id == target_id)
        ).scalar_one()
        assert row.reason == "إزعاج متكرر"
        assert row.expires_at > utcnow()
    finally:
        db.close()

    # قائمة المحظورين للمالك: الاسم والسبب والتواريخ.
    bans = client.get(f"/api/rooms/{room_id}/bans", headers=_token(owner))
    assert bans.status_code == 200
    listed = bans.json()["bans"]
    assert [item["user"]["username"] for item in listed] == ["bantarget"]
    assert listed[0]["reason"] == "إزعاج متكرر"
    assert listed[0]["created_at"] and listed[0]["expires_at"]

    # المشرف المخوّل يقرأ القائمة، وغير المخوّل لا.
    assert client.get(f"/api/rooms/{room_id}/bans", headers=_token(moderator)).status_code == 200
    assert client.get(f"/api/rooms/{room_id}/bans", headers=_token(other)).status_code == 403

    # إلغاء الحظر يدوياً (المالك فقط) يعيد القدرة على الدخول.
    assert client.delete(f"/api/rooms/{room_id}/bans/{target_id}", headers=_token(moderator)).status_code == 403
    assert client.delete(f"/api/rooms/{room_id}/bans/{target_id}", headers=_token(owner)).status_code == 200
    assert client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(target)).status_code == 200

    # طرد 12 شهراً: تاريخ الانتهاء ~365 يوماً بتوقيت الخادم.
    long_ban = client.post(
        f"/api/rooms/{room_id}/members/{target_id}/ban",
        json={"duration": "12mo", "reason": "مخالفة جسيمة"},
        headers=_token(owner),
    )
    assert long_ban.status_code == 200
    payload = long_ban.json()["ban"]
    assert payload["duration"] == "12mo"
    days = (
        datetime.fromisoformat(payload["expires_at"]) - datetime.fromisoformat(payload["created_at"])
    ).days
    assert days in (364, 365)  # 12 شهراً = 365 يوماً بتوقيت الخادم

    # انتهاء المدة يرفع المنع تلقائياً (ساعة الخادم) بلا تدخل يدوي.
    db = SessionLocal()
    try:
        row = db.execute(
            select(RoomBan).where(RoomBan.room_id == room_id, RoomBan.user_id == target_id)
        ).scalar_one()
        row.expires_at = utcnow().replace(year=2000)
        db.commit()
    finally:
        db.close()
    assert client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(target)).status_code == 200
    assert client.get(f"/api/rooms/{room_id}/bans", headers=_token(owner)).json()["bans"] == []


def test_owner_can_unseat_and_room_can_be_deleted(client, make_user):
    owner = make_user("unseatowner")
    member = make_user("unseatedmember")
    room = _create_room(client, owner, "غرفة الإنزال")
    room_id = room["id"]
    member_id = member["user"]["id"]

    client.post(f"/api/rooms/{room_id}/join", json={}, headers=_token(member))
    client.post(f"/api/rooms/{room_id}/seats/6/take", headers=_token(member))
    # العضو لا يستطيع إنزال غيره.
    assert (
        client.post(
            f"/api/rooms/{room_id}/members/{owner['user']['id']}/unseat", headers=_token(member)
        ).status_code
        == 403
    )
    unseated = client.post(f"/api/rooms/{room_id}/members/{member_id}/unseat", headers=_token(owner))
    assert unseated.status_code == 200
    after = next(item for item in unseated.json()["room"]["members"] if item["user"]["id"] == member_id)
    assert after["seat_index"] is None and after["mic_on"] is False

    # حذف الغرفة من المالك يحذف عضويتها ويحرّر حصة الغرفة الواحدة.
    deleted = client.delete(f"/api/rooms/{room_id}", headers=_token(owner))
    assert deleted.status_code == 200
    assert client.get(f"/api/rooms/{room_id}", headers=_token(owner)).status_code == 404
    assert client.post("/api/rooms", json={"name": "غرفة جديدة"}, headers=_token(owner)).status_code == 201


def test_private_room_password(client, make_user):
    owner = make_user("privateowner")
    guest = make_user("privateguest")
    room = client.post(
        "/api/rooms",
        json={"name": "غرفة خاصة", "is_private": True, "password": "1234"},
        headers=_token(owner),
    ).json()["room"]
    room_id = room["id"]
    assert room["password_required"] is True
    assert client.post(f"/api/rooms/{room_id}/join", json={"password": "0000"}, headers=_token(guest)).status_code == 403
    assert client.post(f"/api/rooms/{room_id}/join", json={"password": "1234"}, headers=_token(guest)).status_code == 200
