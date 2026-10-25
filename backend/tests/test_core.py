"""Accounts, profiles, rooms, seats, gifts, wallet and friends."""
from conftest import auth

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def test_registration_login_and_profile(client, make_user):
    data = make_user("alice")
    assert data["wallet"]["diamonds"] == 1000  # welcome bonus, written to the ledger
    token = data["token"]

    me = client.get("/api/auth/me", headers=auth(token))
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "alice"
    assert "password_hash" not in me.json()["user"]

    login = client.post("/api/auth/login", json={"identifier": "alice", "password": "secret123"})
    assert login.status_code == 200 and login.json()["token"]

    updated = client.patch(
        "/api/users/me",
        json={"display_name": "بطل الغرفة", "bio": "مرحباً بالجميع", "locale": "ar"},
        headers=auth(token),
    )
    assert updated.status_code == 200
    assert updated.json()["user"]["display_name"] == "بطل الغرفة"

    ledger = client.get("/api/wallet/ledger", headers=auth(token)).json()["entries"]
    assert any(entry["kind"] == "reward" and entry["amount"] == 1000 for entry in ledger)


def test_duplicate_accounts_and_bad_password(client, make_user):
    make_user("dupuser")
    conflict = client.post(
        "/api/auth/register",
        json={"username": "dupuser", "password": "secret123", "email": "another@test.local"},
    )
    assert conflict.status_code == 409
    bad = client.post("/api/auth/login", json={"identifier": "dupuser", "password": "wrong-one"})
    assert bad.status_code == 401


def test_account_deletion_from_the_app(client, make_user):
    """حذف الحساب من داخل التطبيق: كلمة المرور والتأكيد مطلوبان، والدخول يُمنع بعده."""
    data = make_user("deleteme")
    headers = auth(data["token"])
    user_id = data["user"]["id"]

    # بلا تأكيد أو بكلمة مرور خاطئة لا يُحذف شيء.
    no_confirm = client.request(
        "DELETE", "/api/auth/account", json={"password": "secret123", "confirm": False}, headers=headers
    )
    assert no_confirm.status_code == 400
    bad_password = client.request(
        "DELETE", "/api/auth/account", json={"password": "wrong-one", "confirm": True}, headers=headers
    )
    assert bad_password.status_code == 400
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    # مع التأكيد وكلمة المرور الصحيحة يُغلق الحساب فوراً.
    deleted = client.request(
        "DELETE", "/api/auth/account", json={"password": "secret123", "confirm": True}, headers=headers
    )
    assert deleted.status_code == 200 and deleted.json()["status"] == "deleted"
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.post("/api/auth/login", json={"identifier": "deleteme", "password": "secret123"}).status_code == 401

    # لا تبقى بطاقته الشخصية متاحة لغيره.
    viewer = make_user("deleteviewer")
    assert client.get(f"/api/users/{user_id}", headers=auth(viewer["token"])).status_code == 404


def test_admin_account_cannot_be_deleted_from_the_app(client):
    """حساب الإدارة مستثنى حتى لا يُقفل الوصول إلى لوحة الإدارة."""
    login = client.post("/api/auth/login", json={"identifier": "admin", "password": "admin-test-pass"})
    assert login.status_code == 200, login.text
    response = client.request(
        "DELETE",
        "/api/auth/account",
        json={"password": "admin-test-pass", "confirm": True},
        headers=auth(login.json()["token"]),
    )
    assert response.status_code == 400


def test_avatar_upload_rules(client, make_user):
    token = make_user("avataruser")["token"]
    ok = client.post(
        "/api/users/me/avatar",
        files={"file": ("me.png", PNG, "image/png")},
        headers=auth(token),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["avatar_url"].endswith(".png")

    rejected = client.post(
        "/api/users/me/avatar",
        files={"file": ("me.txt", b"not an image", "text/plain")},
        headers=auth(token),
    )
    assert rejected.status_code == 400


def test_gift_sending_is_idempotent(client, make_user):
    sender = make_user("gifter")
    receiver = make_user("giftreceiver")
    gifts = client.get("/api/gifts", headers=auth(sender["token"])).json()["gifts"]
    rose = next(gift for gift in gifts if gift["name"] == "وردة")
    luxury = next(gift for gift in gifts if gift["price_diamonds"] >= 5000)
    receiver_id = receiver["user"]["id"]

    body = {"gift_id": rose["id"], "currency": "diamonds", "receiver_id": receiver_id, "idempotency_key": "key-one"}
    first = client.post("/api/gifts/send", json=body, headers=auth(sender["token"]))
    assert first.status_code == 201, first.text
    assert first.json()["created"] is True
    assert first.json()["wallet"]["diamonds"] == 990

    replay = client.post("/api/gifts/send", json=body, headers=auth(sender["token"]))
    assert replay.status_code == 201
    assert replay.json()["created"] is False
    assert replay.json()["wallet"]["diamonds"] == 990  # never charged twice

    entries = client.get("/api/wallet/ledger", headers=auth(sender["token"])).json()["entries"]
    assert sum(entry["amount"] for entry in entries if entry["kind"] == "gift_sent") == -10

    receiver_wallet = client.get("/api/auth/me", headers=auth(receiver["token"])).json()["wallet"]
    assert receiver_wallet["diamonds"] == 1006  # 1000 welcome + 60% of 10

    poor = client.post(
        "/api/gifts/send",
        json={"gift_id": luxury["id"], "currency": "diamonds", "receiver_id": receiver_id, "idempotency_key": "key-two"},
        headers=auth(sender["token"]),
    )
    assert poor.status_code == 400

    missing_key = client.post(
        "/api/gifts/send",
        json={"gift_id": rose["id"], "currency": "diamonds", "receiver_id": receiver_id},
        headers=auth(sender["token"]),
    )
    assert missing_key.status_code == 400


def test_transfers_are_atomic(client, make_user):
    sender = make_user("transfersender")
    receiver = make_user("transferreceiver")
    sent = client.post(
        "/api/wallet/transfer",
        json={"to_username": "transferreceiver", "currency": "diamonds", "amount": 200, "idempotency_key": "tr-one"},
        headers=auth(sender["token"]),
    )
    assert sent.status_code == 201
    assert sent.json()["wallet"]["diamonds"] == 800
    assert client.get("/api/auth/me", headers=auth(receiver["token"])).json()["wallet"]["diamonds"] == 1200

    replay = client.post(
        "/api/wallet/transfer",
        json={"to_username": "transferreceiver", "currency": "diamonds", "amount": 200, "idempotency_key": "tr-one"},
        headers=auth(sender["token"]),
    )
    assert replay.json()["wallet"]["diamonds"] == 800
    assert client.get("/api/auth/me", headers=auth(receiver["token"])).json()["wallet"]["diamonds"] == 1200

    too_much = client.post(
        "/api/wallet/transfer",
        json={"to_username": "transferreceiver", "currency": "diamonds", "amount": 999999},
        headers=auth(sender["token"]),
    )
    assert too_much.status_code == 400


def test_friends_and_private_messages(client, make_user):
    alice = make_user("friendalice")
    bob = make_user("friendbob")

    request = client.post("/api/friends/requests", json={"username": "friendbob"}, headers=auth(alice["token"]))
    assert request.status_code == 201

    incoming = client.get("/api/friends/requests", headers=auth(bob["token"])).json()["incoming"]
    assert len(incoming) == 1
    assert client.post(f"/api/friends/requests/{incoming[0]['id']}/accept", headers=auth(bob["token"])).status_code == 200

    friends = client.get("/api/friends", headers=auth(alice["token"])).json()["friends"]
    assert [friend["username"] for friend in friends] == ["friendbob"]

    message = client.post(f"/api/messages/{bob['user']['id']}", json={"text": "مرحباً"}, headers=auth(alice["token"]))
    assert message.status_code == 201
    conversation = client.get(f"/api/messages/{alice['user']['id']}", headers=auth(bob["token"])).json()
    assert conversation["messages"][0]["text"] == "مرحباً"

    notifications = client.get("/api/notifications", headers=auth(bob["token"])).json()
    assert any(item["type"] == "message" for item in notifications["notifications"])

    # Switching a category off stops it from being created.
    client.patch("/api/notifications/preferences", json={"prefs": {"message": False}}, headers=auth(bob["token"]))
    client.post(f"/api/messages/{bob['user']['id']}", json={"text": "رسالة أخرى"}, headers=auth(alice["token"]))
    after = client.get("/api/notifications", headers=auth(bob["token"])).json()["notifications"]
    assert len([item for item in after if item["type"] == "message"]) == 1

    # Reports reach the administrators.
    report = client.post(
        "/api/reports",
        json={"target_type": "user", "target_id": alice["user"]["id"], "reason": "إساءة", "details": "اختبار"},
        headers=auth(bob["token"]),
    )
    assert report.status_code == 201
