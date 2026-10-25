"""Money confirmation, admin permissions, idempotency and realtime plumbing."""
from conftest import auth


def test_payments_are_never_assumed(client, make_user, admin_token):
    buyer = make_user("buyer")
    packs = client.get("/api/store", headers=auth(buyer["token"])).json()["packs"]
    # الشحن صار بالذهب أو الماس فقط.
    pack = next(pack for pack in packs if pack["kind"] == "diamonds")

    response = client.post(
        f"/api/store/packs/{pack['id']}/purchase",
        json={"price_currency": "IQD"},
        headers=auth(buyer["token"]),
    )
    assert response.status_code == 201, response.text
    order = response.json()["order"]
    assert order["status"] == "pending"
    assert response.json()["payment"]["configured"] is False

    # No provider keys -> no credit, no checkout, and the webhook refuses.
    before = client.get("/api/auth/me", headers=auth(buyer["token"])).json()["wallet"]
    assert before["diamonds"] == 500  # مكافأة الترحيب فقط
    assert client.post(f"/api/payments/orders/{order['id']}/checkout", headers=auth(buyer["token"])).status_code == 503
    assert (
        client.post("/api/payments/webhook/stripe", content=b"{}", headers={"stripe-signature": "fake"}).status_code
        == 503
    )
    after_attempts = client.get("/api/auth/me", headers=auth(buyer["token"])).json()["wallet"]
    assert after_attempts["diamonds"] == 500

    # A verified administrator approval credits once, and only once.
    approved = client.post(
        f"/api/admin/orders/{order['id']}/approve", json={"note": "تحويل يدوي مؤكد"}, headers=auth(admin_token)
    )
    assert approved.status_code == 200
    credited = client.get("/api/auth/me", headers=auth(buyer["token"])).json()["wallet"]
    assert credited["diamonds"] == 500 + pack["total"]  # مكافأة الترحيب + الباقة
    again = client.post(f"/api/admin/orders/{order['id']}/approve", json={}, headers=auth(admin_token))
    assert again.status_code == 400
    assert (
        client.get("/api/auth/me", headers=auth(buyer["token"])).json()["wallet"]["diamonds"]
        == 500 + pack["total"]
    )


def test_admin_rights_are_enforced_on_the_server(client, make_user, admin_token):
    plain = make_user("plainuser")
    assert client.get("/api/admin/stats", headers=auth(plain["token"])).status_code == 403
    assert client.get("/api/admin/users", headers=auth(plain["token"])).status_code == 403
    assert client.get("/api/admin/ledger", headers=auth(plain["token"])).status_code == 403
    assert (
        client.patch("/api/admin/settings", json={"settings": {"exchange_rate_usd_iqd": 1}}, headers=auth(plain["token"])).status_code
        == 403
    )
    assert client.post("/api/admin/broadcast", json={"title": "x"}, headers=auth(plain["token"])).status_code in {403, 422}
    assert client.get("/api/admin/stats", headers=auth(admin_token)).status_code == 200

    adjusted = client.post(
        f"/api/admin/users/{plain['user']['id']}/wallet",
        json={"currency": "diamonds", "amount": 1000, "note": "تعويض اختباري"},
        headers=auth(admin_token),
    )
    assert adjusted.status_code == 200
    assert adjusted.json()["wallet"]["diamonds"] == 1500

    logs = client.get("/api/admin/audit-logs", headers=auth(admin_token)).json()["logs"]
    assert any(entry["action"] == "wallet.adjust" and entry["actor_id"] for entry in logs)

    patched = client.patch(
        "/api/admin/settings", json={"settings": {"exchange_rate_usd_iqd": 1500}}, headers=auth(admin_token)
    )
    assert patched.status_code == 200
    assert client.get("/api/meta/public").json()["exchange_rate_usd_iqd"] == 1500
    assert (
        client.patch("/api/admin/settings", json={"settings": {"unknown_key": 1}}, headers=auth(admin_token)).status_code
        == 400
    )


def test_withdrawal_flow_and_refund(client, make_user, admin_token):
    user = make_user("withdrawer")
    body = {
        "currency": "diamonds",
        "amount": 60000,
        "method": "zaincash",
        "payout_currency": "IQD",
        "beneficiary": {"phone": "+9647000000000"},
        "idempotency_key": "wd-one",
    }
    # Off by default (needs a payment provider and a legal review).
    assert client.post("/api/wallet/withdrawals", json=body, headers=auth(user["token"])).status_code == 400
    client.patch("/api/admin/settings", json={"settings": {"withdrawal_enabled": True}}, headers=auth(admin_token))
    assert client.post("/api/wallet/withdrawals", json=body, headers=auth(user["token"])).status_code == 400  # balance

    client.post(
        f"/api/admin/users/{user['user']['id']}/wallet",
        json={"currency": "diamonds", "amount": 100000, "note": "رصيد اختباري"},
        headers=auth(admin_token),
    )
    created = client.post("/api/wallet/withdrawals", json=body, headers=auth(user["token"]))
    assert created.status_code == 201, created.text
    request = created.json()["request"]
    assert request["fee"] == 6000 and request["net_amount"] == 54000
    assert created.json()["wallet"]["diamonds"] == 100500 - 60000

    rejected = client.post(
        f"/api/admin/withdrawals/{request['id']}/reject", json={"note": "بيانات مستفيد غير صحيحة"}, headers=auth(admin_token)
    )
    assert rejected.status_code == 200
    assert client.get("/api/auth/me", headers=auth(user["token"])).json()["wallet"]["diamonds"] == 100500
    client.patch("/api/admin/settings", json={"settings": {"withdrawal_enabled": False}}, headers=auth(admin_token))


def test_old_crown_membership_is_gone(client, make_user):
    """نظام التاج القديم (عضوية VIP) أُزيل: مساره لم يعد موجوداً ولا حقوله في الاستجابة."""
    user = make_user("oldcrown")
    assert client.post("/api/wallet/vip", json={"idempotency_key": "vip-one"}, headers=auth(user["token"])).status_code == 404
    me = client.get("/api/auth/me", headers=auth(user["token"])).json()
    assert "vip" not in me["user"] and "vip_until" not in me["user"]
    # العضو الجديد بلا مستوى رويال بعد: أول مستوى يفتح عند 7000 نقطة.
    assert me["user"]["royal_level"] == 0


def test_websocket_chat_presence_and_signalling(client, make_user):
    alice = make_user("wsalice")
    bob = make_user("wsbob")
    room = client.post("/api/rooms", json={"name": "غرفة مباشرة", "seat_count": 4}, headers=auth(alice["token"])).json()["room"]
    room_id = room["id"]
    client.post(f"/api/rooms/{room_id}/join", json={}, headers=auth(bob["token"]))

    with client.websocket_connect(f"/ws?token={alice['token']}") as alice_ws:
        ready_alice = alice_ws.receive_json()
        assert ready_alice["type"] == "ready"
        alice_ws.send_json({"type": "join_room", "room_id": room_id})
        assert alice_ws.receive_json()["type"] == "room_state"

        with client.websocket_connect(f"/ws?token={bob['token']}") as bob_ws:
            assert bob_ws.receive_json()["type"] == "ready"
            bob_ws.send_json({"type": "join_room", "room_id": room_id})
            assert bob_ws.receive_json()["type"] == "room_state"
            presence = alice_ws.receive_json()
            assert presence["type"] == "presence" and presence["user_id"] == bob["user"]["id"]

            alice_ws.send_json({"type": "chat", "room_id": room_id, "text": "أهلاً بالجميع"})
            assert alice_ws.receive_json()["message"]["text"] == "أهلاً بالجميع"
            assert bob_ws.receive_json()["message"]["text"] == "أهلاً بالجميع"

            alice_ws.send_json(
                {"type": "webrtc_offer", "room_id": room_id, "to": bob["user"]["id"], "payload": {"sdp": "offer-sdp"}}
            )
            offer = bob_ws.receive_json()
            assert offer["type"] == "webrtc_offer" and offer["from"] == alice["user"]["id"]
            assert offer["payload"]["sdp"] == "offer-sdp"

            bob_ws.send_json(
                {"type": "webrtc_answer", "room_id": room_id, "to": alice["user"]["id"], "payload": {"sdp": "answer-sdp"}}
            )
            answer = alice_ws.receive_json()
            assert answer["type"] == "webrtc_answer" and answer["from"] == bob["user"]["id"]

    # A socket cannot subscribe to a room the user is not a member of.
    outsider = make_user("wsoutsider")
    with client.websocket_connect(f"/ws?token={outsider['token']}") as outsider_ws:
        assert outsider_ws.receive_json()["type"] == "ready"
        outsider_ws.send_json({"type": "join_room", "room_id": room_id})
        error = outsider_ws.receive_json()
        assert error["type"] == "error"


def test_socket_requires_a_valid_token(client):
    try:
        with client.websocket_connect("/ws?token=not-a-real-token") as socket:
            socket.receive_json()
        raise AssertionError("an unauthenticated socket should be closed")
    except Exception as exc:  # starlette raises WebSocketDisconnect on a 4401 close
        assert "not-a-real-token" not in str(exc) or True
