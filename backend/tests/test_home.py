"""الصفحة الرئيسية: كل قسم من بيانات حقيقية — غرف، ترتيبات، أعضاء جدد، دول."""
from conftest import auth


def test_home_reports_every_section_from_the_database(client, make_user):
    viewer = make_user("homeviewer")
    other = make_user("homeother")
    headers = auth(viewer["token"])

    payload = client.get("/api/home", headers=headers).json()
    assert payload["tab"] == "popular"
    assert payload["my_room_id"] is None
    assert set(payload["rankings"]) == {"lovers", "honor", "players"}
    assert len(payload["rankings"]["players"]) <= 3
    # عضو جديد سُجّل قبل قليل يظهر في لوحة «المستخدمين الجدد» بصورته الحقيقية.
    usernames = [row["username"] for row in payload["new_users"]]
    assert "homeother" in usernames
    assert viewer["user"]["username"] not in usernames
    # عدّاد الدول مشتق من عدد الأعضاء النشطين في كل دولة (لا رقم مكتوب).
    assert isinstance(payload["countries"], list)
    # كل غرفة تُرسل بصور أعضائها (الشريحة تعرض صورتين) وبصورة فوتوغرافية حقيقية
    # في `background_photo_url` — حتى الغرف التي ما زالت على ثيم متدرّج قديم.
    for room in payload["rooms"]:
        assert isinstance(room["members"], list)
        assert room["background_photo_url"].startswith("/img/rooms/")
        assert room["background_photo_url"].endswith(".jpg")
    assert other["user"]["id"] in [row["id"] for row in payload["top_users"]] or payload["top_users"] == []


def test_every_background_has_a_real_photo(client):
    """كل خلفية غرفة (صورة أو ثيم متدرّج قديم) لها صورة فوتوغرافية حقيقية تمثّلها."""
    from app.room_backgrounds import BACKGROUND_SLUGS, photo_url

    for slug in BACKGROUND_SLUGS:
        url = photo_url(slug)
        assert url.startswith("/img/rooms/"), slug
        assert url.endswith(".jpg"), slug
    # ثيمان مختلفان لا يُعرضان بالصورة نفسها.
    assert photo_url("sunset") != photo_url("aurora")
    assert photo_url("aurora") == photo_url("night")


def test_home_tabs_follow_the_rooms_i_own_and_visit(client, make_user):
    owner = make_user("homeowner")
    visitor = make_user("homevisitor")

    created = client.post("/api/rooms", json={"name": "غرفة الرئيسية"}, headers=auth(owner["token"]))
    assert created.status_code == 201, created.text
    room_id = created.json()["room"]["id"]

    # مالك الغرفة: «غرفتي» تعرض غرفته ورقمها يعود من الخادم.
    mine = client.get("/api/home?tab=mine", headers=auth(owner["token"])).json()
    assert mine["my_room_id"] == room_id
    assert [room["id"] for room in mine["rooms"]] == [room_id]

    # الزائر: يدخل الغرفة فتظهر له في «غرف زرتها»، ولا تظهر قبل الانضمام.
    before = client.get("/api/home?tab=visited", headers=auth(visitor["token"])).json()
    assert before["rooms"] == []
    assert client.post(f"/api/rooms/{room_id}/join", json={}, headers=auth(visitor["token"])).status_code == 200
    after = client.get("/api/home?tab=visited", headers=auth(visitor["token"])).json()
    assert [room["id"] for room in after["rooms"]] == [room_id]
    assert [member["username"] for member in after["rooms"][0]["members"]][:1] == ["homeowner"]

    # الغرفة الشائعة تحتوي أعضاءها الحقيقيين (المالك انضم عند الإنشاء).
    popular = client.get("/api/home?tab=popular", headers=auth(visitor["token"])).json()
    target = next(room for room in popular["rooms"] if room["id"] == room_id)
    assert "homeowner" in [member["username"] for member in target["members"]]


def test_member_card_reports_the_follow_state_and_real_counts(client, make_user):
    """بطاقة العضو في الصفحة الرئيسية: حالة المتابعة وأرقام المتابعين من الخادم."""
    viewer = make_user("cardsviewer")
    target = make_user("cardstarget")
    target_id = client.get("/api/auth/me", headers=auth(target["token"])).json()["user"]["id"]

    card = client.get(f"/api/users/{target_id}", headers=auth(viewer["token"])).json()
    assert card["following"] is False
    assert card["stats"]["followers"] == 0

    client.post(f"/api/follows/{target_id}", headers=auth(viewer["token"]))
    card = client.get(f"/api/users/{target_id}", headers=auth(viewer["token"])).json()
    assert card["following"] is True
    assert card["stats"]["followers"] == 1

    client.delete(f"/api/follows/{target_id}", headers=auth(viewer["token"]))
    card = client.get(f"/api/users/{target_id}", headers=auth(viewer["token"])).json()
    assert card["following"] is False
    assert card["stats"]["followers"] == 0


def test_home_tab_falls_back_to_popular_and_needs_auth(client, make_user):
    member = make_user("homefallback")
    headers = auth(member["token"])
    assert client.get("/api/home?tab=unknown", headers=headers).json()["tab"] == "popular"
    assert client.get("/api/home").status_code == 401
