"""نظام رويال: النقاط من الشحن فقط، والمستوى من عتبات قابلة للتعديل."""
import pytest
from conftest import auth

from app.db import SessionLocal
from app.models import RoyalPointEntry, RoyalTier, StorePack, User
from app.royal import add_points, status_from_points
from app.security import hash_password


@pytest.fixture()
def diamonds_pack(client):
    """أصغر حزمة شحن من البذور الحقيقية (400 وحدة / 7 نقاط رويال)."""
    db = SessionLocal()
    try:
        pack = db.query(StorePack).filter(StorePack.kind == "diamonds").order_by(StorePack.sort).first()
        assert pack is not None, "حزم الجواهر لم تُبذر"
        return {
            "id": pack.id,
            "amount": pack.amount,
            "royal_points": pack.royal_points,
        }
    finally:
        db.close()


@pytest.fixture()
def throwaway_user():
    """عضو مؤقت لاختبارات سجل النقاط، يُحذف في النهاية فلا يلوّث قاعدة الاختبار."""
    db = SessionLocal()
    user = User(username="royalledger", password_hash=hash_password("secret123"), display_name="royalledger")
    db.add(user)
    db.commit()
    user_id = user.id
    db.close()
    yield user_id
    db = SessionLocal()
    try:
        db.query(RoyalPointEntry).filter(RoyalPointEntry.user_id == user_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
    finally:
        db.close()


def test_royal_overview_lists_five_levels_from_the_server(client, make_user):
    user = make_user("royaloverview")
    payload = client.get("/api/royal", headers=auth(user["token"])).json()
    assert [tier["level"] for tier in payload["tiers"]] == [1, 2, 3, 4, 5]
    assert payload["status"]["level"] == 0  # أول مستوى يفتح عند 7000 نقطة
    assert payload["status"]["points"] == 0
    assert payload["status"]["points_to_next"] > 0
    # الامتيازات حقيقية وتكبر مع المستوى، ولكل مستوى تاجه (لونه) من الخادم.
    assert all(tier["privileges"] for tier in payload["tiers"])
    assert len(payload["tiers"][4]["privileges"]) > len(payload["tiers"][0]["privileges"])
    assert all(tier["accent"].startswith("#") for tier in payload["tiers"])
    # حزم الشحن (ذهب وماس) ونقاطها من قاعدة البيانات، لا أرقام ثابتة في الواجهة.
    assert payload["packages"] and {pack["kind"] for pack in payload["packages"]} <= {"gold", "diamonds"}
    assert all(pack["royal_points"] > 0 for pack in payload["packages"])


def test_royal_points_are_credited_once_after_the_order_is_confirmed(
    client, make_user, admin_token, diamonds_pack
):
    user = make_user("royaldiamonds")
    purchase = client.post(
        f"/api/store/packs/{diamonds_pack['id']}/purchase",
        json={"price_currency": "IQD", "idempotency_key": "royal-order-one"},
        headers=auth(user["token"]),
    )
    assert purchase.status_code == 201, purchase.text
    order = purchase.json()["order"]
    assert order["royal_points"] == diamonds_pack["royal_points"]

    # قبل تأكيد الدفع على الخادم: مكافأة الترحيب فقط ولا نقاط رويال.
    before = client.get("/api/auth/me", headers=auth(user["token"])).json()
    assert before["wallet"]["diamonds"] == 500
    assert before["user"]["royal_points"] == 0

    approved = client.post(
        f"/api/admin/orders/{order['id']}/approve",
        json={"note": "تأكيد الدفع في الاختبار"},
        headers=auth(admin_token),
    )
    assert approved.status_code == 200, approved.text

    after = client.get("/api/auth/me", headers=auth(user["token"])).json()
    assert after["wallet"]["diamonds"] == 500 + diamonds_pack["amount"]
    assert after["user"]["royal_points"] == diamonds_pack["royal_points"]

    # إعادة تأكيد الطلب نفسه لا تضيف رصيداً ولا نقاطاً مرة ثانية.
    replay = client.post(
        f"/api/admin/orders/{order['id']}/approve", json={"note": "تكرار"}, headers=auth(admin_token)
    )
    assert replay.status_code == 400
    again = client.get("/api/auth/me", headers=auth(user["token"])).json()
    assert again["wallet"]["diamonds"] == 500 + diamonds_pack["amount"]
    assert again["user"]["royal_points"] == diamonds_pack["royal_points"]


def test_level_follows_the_admin_threshold_not_the_points(client, make_user, admin_token, diamonds_pack):
    user = make_user("royalthreshold")
    overview = client.get("/api/royal", headers=auth(user["token"])).json()
    level_two = next(tier for tier in overview["tiers"] if tier["level"] == 2)

    # المشرف يخفض عتبة المستوى الثاني إلى نقاط الباقة نفسها.
    patched = client.patch(
        "/api/admin/royal/tiers/2",
        json={"required_points": diamonds_pack["royal_points"]},
        headers=auth(admin_token),
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["tier"]["required_points"] == diamonds_pack["royal_points"]

    order = client.post(
        f"/api/store/packs/{diamonds_pack['id']}/purchase",
        json={"price_currency": "IQD", "idempotency_key": "royal-threshold-order"},
        headers=auth(user["token"]),
    ).json()["order"]
    client.post(f"/api/admin/orders/{order['id']}/approve", json={}, headers=auth(admin_token))

    me = client.get("/api/auth/me", headers=auth(user["token"])).json()
    assert me["user"]["royal_points"] == diamonds_pack["royal_points"]
    assert me["user"]["royal_level"] == 2
    assert me["user"]["royal_name"] == level_two["name_ar"]
    assert level_two["name_ar"] in me["user"]["badges"]

    # إرجاع العتبة الأصلية حتى لا تتأثر الاختبارات التالية.
    restored = client.patch(
        "/api/admin/royal/tiers/2",
        json={"required_points": level_two["required_points"]},
        headers=auth(admin_token),
    )
    assert restored.status_code == 200
    # بعد إرجاع العتبة: 7 نقاط لا تفتح أول مستوى (7000 نقطة افتراضياً).
    assert client.get("/api/auth/me", headers=auth(user["token"])).json()["user"]["royal_level"] == 0


def test_privileges_and_thresholds_are_editable_from_the_admin_panel(client, make_user, admin_token):
    tiers = client.get("/api/admin/royal", headers=auth(admin_token)).json()["tiers"]
    level_three = next(tier for tier in tiers if tier["level"] == 3)
    original = level_three["privileges"]

    patched = client.patch(
        "/api/admin/royal/tiers/3",
        json={
            "privileges": [
                {"key": "cover_exchange", "title_ar": "الاستبدال الفائق لقطع الغلاف", "featured": True},
                {"key": "custom_perk", "title_ar": "امتياز اختباري", "icon": "star"},
            ]
        },
        headers=auth(admin_token),
    )
    assert patched.status_code == 200, patched.text
    assert [item["title_ar"] for item in patched.json()["tier"]["privileges"]] == [
        "الاستبدال الفائق لقطع الغلاف",
        "امتياز اختباري",
    ]
    assert patched.json()["tier"]["privileges"][0]["featured"] is True

    # المستخدم يرى الامتياز الجديد فوراً من الخادم.
    public = client.get("/api/royal", headers=auth(make_user("royalprivileges")["token"])).json()
    level_three_public = next(tier for tier in public["tiers"] if tier["level"] == 3)
    assert [item["title_ar"] for item in level_three_public["privileges"]][-1] == "امتياز اختباري"

    restored = client.patch(
        "/api/admin/royal/tiers/3", json={"privileges": original}, headers=auth(admin_token)
    )
    assert restored.status_code == 200


def test_royal_admin_routes_need_the_settings_permission(client, make_user, admin_token):
    user = make_user("royalmoderator")
    client.patch(
        f"/api/admin/users/{user['user']['id']}",
        json={"is_admin": True, "admin_role": "moderator"},
        headers=auth(admin_token),
    )
    login = client.post(
        "/api/auth/login", json={"identifier": "royalmoderator", "password": "secret123"}
    ).json()
    assert client.get("/api/admin/royal", headers=auth(login["token"])).status_code == 403
    assert (
        client.patch(
            "/api/admin/royal/tiers/1", json={"required_points": 5}, headers=auth(login["token"])
        ).status_code
        == 403
    )


def test_admin_can_adjust_royal_points_and_a_shortage_is_rejected(client, make_user, admin_token):
    user = make_user("royaladjust")
    granted = client.post(
        f"/api/admin/users/{user['user']['id']}/wallet",
        json={"currency": "royal", "amount": 40, "note": "منحة رويال اختبارية"},
        headers=auth(admin_token),
    )
    assert granted.status_code == 200, granted.text
    assert granted.json()["royal"]["points"] == 40

    taken = client.post(
        f"/api/admin/users/{user['user']['id']}/wallet",
        json={"currency": "royal", "amount": -40, "note": "سحب نقاط اختباري"},
        headers=auth(admin_token),
    )
    assert taken.status_code == 200
    assert taken.json()["royal"]["points"] == 0

    too_much = client.post(
        f"/api/admin/users/{user['user']['id']}/wallet",
        json={"currency": "royal", "amount": -5, "note": "أكثر من الرصيد"},
        headers=auth(admin_token),
    )
    assert too_much.status_code == 400


def test_level_is_monotonic_against_the_thresholds():
    rows = [
        RoyalTier(level=level, name_ar=f"رويال {level}", required_points=points, privileges=[])
        for level, points in ((1, 0), (2, 500), (3, 2000), (4, 6000), (5, 15000))
    ]
    assert status_from_points(0, rows)["level"] == 1
    assert status_from_points(499, rows)["level"] == 1
    assert status_from_points(500, rows)["level"] == 2
    assert status_from_points(15000, rows)["level"] == 5
    assert status_from_points(15000, rows)["points_to_next"] == 0
    assert status_from_points(15000, rows)["progress"] == 100


def test_royal_points_ledger_ref_is_idempotent(throwaway_user):
    db = SessionLocal()
    try:
        first = add_points(db, throwaway_user, 7, ref="test-royal-ref-once")
        db.commit()
        second = add_points(db, throwaway_user, 7, ref="test-royal-ref-once")
        assert first.id == second.id
        assert db.get(User, throwaway_user).royal_points == 7

        add_points(db, throwaway_user, -7, ref="test-royal-ref-once-undo")
        db.commit()
        assert db.get(User, throwaway_user).royal_points == 0
    finally:
        db.close()
