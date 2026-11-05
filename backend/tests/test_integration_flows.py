"""اختبارات تكامل: المسار الكامل من التسجيل إلى بطاقة الهوية وإنشاء الغرفة.

كل اختبار يمشي نفس المسارات التي تمشيها الواجهة (`/api/auth/register` ثم
`/api/auth/me` ثم `/api/rooms` …) ويتحقق من عقد البيانات الذي تعتمد عليه
بطاقة الملف الشخصي الجديدة في `web/src/pages/Profile.jsx`: تاريخ الانضمام،
حالة التوثيق، النبذة، المستوى ونقاط الخبرة، وشارات رويال.
"""
import datetime as dt

from conftest import auth

# الحقول التي تقرأها بطاقة الهوية الجديدة من `/api/auth/me`.
PROFILE_CARD_FIELDS = (
    "id",
    "username",
    "display_name",
    "bio",
    "country",
    "level",
    "xp_into_level",
    "next_level_xp",
    "royal_level",
    "royal_name",
    "badges",
    "created_at",
    "email_verified",
    "phone_verified",
)


def _register(client, username: str, display_name: str, email: str):
    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "display_name": display_name,
            "email": email,
            "password": "secret123",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_signup_edit_and_identity_card_flow(client):
    """التسجيل من نموذج الواجهة → الدخول → تعديل الملف → بطاقة العضو العامة."""
    signup = _register(client, "flowmember", "عضو التدفق", "flowmember@test.local")
    token = signup["token"]
    user = signup["user"]
    headers = auth(token)

    # 1) كل حقل تقرأه البطاقة موجود في استجابة التسجيل بنوعه الصحيح.
    for field in PROFILE_CARD_FIELDS:
        assert field in user, field
    joined = dt.datetime.fromisoformat(user["created_at"])
    assert joined.tzinfo is not None
    assert user["level"] == 1
    assert user["xp_into_level"] == 0
    assert user["next_level_xp"] > 0
    assert isinstance(user["badges"], list)
    assert user["email_verified"] is False and user["phone_verified"] is False
    assert user["bio"] == ""

    # 2) المحفظة والعناصر المُستخدمة التي تعرضها البطاقة تأتي من نفس الاستجابة.
    assert signup["wallet"] == {"gold": 0, "diamonds": 1000}  # مكافأة الترحيب الحقيقية
    assert isinstance(signup["equipped_items"], list)

    # 3) الدخول بالبريد (تبويب الدخول) يسلّم نفس الحساب وتاريخ الانضمام نفسه.
    login = client.post(
        "/api/auth/login", json={"identifier": "flowmember@test.local", "password": "secret123"}
    )
    assert login.status_code == 200, login.text
    headers = auth(login.json()["token"])
    assert login.json()["user"]["id"] == user["id"]

    # 4) لمسة النبذة تفتح تعديل الملف: الاسم والنبذة يُحفظان ويظهران في `/api/auth/me`.
    updated = client.patch(
        "/api/users/me",
        json={"display_name": "نجم الرويال", "bio": "أحب الغرف الهادئة", "locale": "ar"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["user"]["display_name"] == "نجم الرويال"
    assert me.json()["user"]["bio"] == "أحب الغرف الهادئة"
    assert me.json()["user"]["created_at"] == user["created_at"]  # تاريخ الانضمام ثابت
    assert me.json()["wallet"] == signup["wallet"]

    # 5) العضو الآخر يرى القيم نفسها في بطاقة العضو العامة (بلا بيانات خاصة).
    viewer = _register(client, "flowviewer", "زائر التدفق", "flowviewer@test.local")
    public = client.get(f"/api/users/{user['id']}", headers=auth(viewer["token"]))
    assert public.status_code == 200, public.text
    card = public.json()
    assert card["display_name"] == "نجم الرويال"
    assert card["bio"] == "أحب الغرف الهادئة"
    assert "email" not in card and "phone" not in card


def test_room_creation_join_and_profile_progress_flow(client):
    """إنشاء غرفة من صفحة الغرف → ظهورها في القائمة → انضمام عضو → نقاط الخبرة في البطاقة."""
    owner = _register(client, "flowowner", "مالك الغرفة", "flowowner@test.local")
    visitor = _register(client, "flowvisitor", "عضو الغرفة", "flowvisitor@test.local")
    owner_headers = auth(owner["token"])
    visitor_headers = auth(visitor["token"])

    # 1) الإنشاء كما في نموذج صفحة `/rooms`.
    created = client.post(
        "/api/rooms",
        json={"name": "غرفة التكامل", "description": "غرفة اختبار التدفق الكامل"},
        headers=owner_headers,
    )
    assert created.status_code == 201, created.text
    room = created.json()["room"]
    assert room["name"] == "غرفة التكامل"
    assert room["owner"]["id"] == owner["user"]["id"]
    assert room["seat_count"] == 12
    assert room["background_photo_url"].startswith("/img/rooms/")
    assert [(member["user"]["id"], member["role"]) for member in room["members"]] == [
        (owner["user"]["id"], "owner")
    ]

    # 2) غرفة واحدة لكل عضو — الطلب الثاني يُرفض ويُحرّر الحصة عند الحذف فقط.
    again = client.post("/api/rooms", json={"name": "غرفة ثانية"}, headers=owner_headers)
    assert again.status_code == 409

    # 3) الغرفة تظهر في قائمة `/rooms` عند عضو آخر مع عدّاد الأعضاء الحقيقي.
    listing = client.get("/api/rooms", headers=visitor_headers)
    assert listing.status_code == 200
    rows = {row["id"]: row for row in listing.json()["rooms"]}
    assert room["id"] in rows
    assert rows[room["id"]]["member_count"] == 1
    assert listing.json()["my_room_id"] is None

    # 4) الانضمام المباشر يضيف العضو ويحدّث العدّاد.
    joined = client.post(f"/api/rooms/{room['id']}/join", json={}, headers=visitor_headers)
    assert joined.status_code == 200, joined.text
    state = joined.json()["room"]
    assert state["member_count"] == 2
    assert {member["user"]["id"] for member in state["members"]} == {
        owner["user"]["id"],
        visitor["user"]["id"],
    }

    # 5) الانضمام يمنح 5 نقاط خبرة، وشريط المستوى في بطاقة الهوية يقرأها من `/api/auth/me`.
    visitor_me = client.get("/api/auth/me", headers=visitor_headers).json()["user"]
    assert visitor_me["xp"] == 5
    assert visitor_me["xp_into_level"] == 5
    assert visitor_me["level"] == 1
    assert 0 < visitor_me["xp_into_level"] < visitor_me["next_level_xp"]

    # 6) المغادرة تُرجع العدّاد، والحذف يحرّر الغرفة الواحدة للمالك.
    left = client.post(f"/api/rooms/{room['id']}/leave", headers=visitor_headers)
    assert left.status_code == 200, left.text
    assert left.json()["room"]["member_count"] == 1

    deleted = client.delete(f"/api/rooms/{room['id']}", headers=owner_headers)
    assert deleted.status_code == 200, deleted.text
    assert client.get(f"/api/rooms/{room['id']}", headers=owner_headers).status_code == 404

    recreated = client.post("/api/rooms", json={"name": "غرفة بعد الحذف"}, headers=owner_headers)
    assert recreated.status_code == 201, recreated.text
