"""اختبارات تكامل للـ WebSocket: الاتصال، الحضور، وتسليم الرسائل الفوري.

كل اختبار يمشي المسار الحقيقي: تسجيل عضو → إنشاء غرفة → انضمام عبر REST →
اتصال WebSocket → إرسال رسالة → استقبالها على كل العملاء المتصلين بالغرفة.
"""
from contextlib import ExitStack

from conftest import auth


def _connect(stack: ExitStack, client, token: str):
    """يفتح اتصالاً حقيقياً ويستهلك رسالة الترحيب `ready`."""
    socket = stack.enter_context(client.websocket_connect(f"/ws?token={token}"))
    ready = socket.receive_json()
    assert ready["type"] == "ready", ready
    return socket, ready


def _next(socket, kind: str, limit: int = 12):
    """يقرأ حتى تصل رسالة من النوع المطلوب (يتجاوز أحداث الحضور الأخرى)."""
    for _ in range(limit):
        message = socket.receive_json()
        if message["type"] == kind:
            return message
    raise AssertionError(f"لم تصل رسالة من النوع {kind}")


def _join_room(socket, room_id: int) -> dict:
    socket.send_json({"type": "join_room", "room_id": room_id})
    message = _next(socket, "room_state")
    assert message["room"]["id"] == room_id
    return message["room"]


def _make_room(client, owner: dict, name: str) -> int:
    response = client.post(
        "/api/rooms", json={"name": name, "seat_count": 4}, headers=auth(owner["token"])
    )
    assert response.status_code == 201, response.text
    return response.json()["room"]["id"]


def _join_via_rest(client, user: dict, room_id: int) -> None:
    response = client.post(f"/api/rooms/{room_id}/join", json={}, headers=auth(user["token"]))
    assert response.status_code == 200, response.text


def _history(client, user: dict, room_id: int) -> list[dict]:
    response = client.get(f"/api/rooms/{room_id}/messages", headers=auth(user["token"]))
    assert response.status_code == 200, response.text
    return response.json()["messages"]


def test_ws_connects_and_answers_heartbeat(client, make_user):
    """الاتصال يبدأ برسالة ready ثم يردّ على ping بـ pong ويرفض الأنواع المجهولة."""
    user = make_user("wsready")
    with ExitStack() as stack:
        socket, ready = _connect(stack, client, user["token"])
        assert ready["user"]["id"] == user["user"]["id"]
        assert ready["user"]["username"] == "wsready"
        assert ready["online"] is True

        socket.send_json({"type": "ping"})
        assert socket.receive_json() == {"type": "pong"}

        socket.send_json({"type": "kind-we-do-not-know"})
        unknown = socket.receive_json()
        assert unknown["type"] == "error"
        assert "نوع غير معروف" in unknown["message"]


def test_ws_broadcasts_room_chat_to_every_member(client, make_user):
    """رسالة واحدة تُسلَّم فوراً لكل العملاء في الغرفة وتُحفظ في سجل الرسائل."""
    alice = make_user("wsbroadcastalice")
    bob = make_user("wsbroadcastbob")
    carol = make_user("wsbroadcastcarol")
    room_id = _make_room(client, alice, "غرفة البث")
    _join_via_rest(client, bob, room_id)
    _join_via_rest(client, carol, room_id)

    with ExitStack() as stack:
        alice_ws, _ = _connect(stack, client, alice["token"])
        _join_room(alice_ws, room_id)

        bob_ws, _ = _connect(stack, client, bob["token"])
        _join_room(bob_ws, room_id)
        presence = _next(alice_ws, "presence")
        assert presence["user_id"] == bob["user"]["id"] and presence["online"] is True

        carol_ws, _ = _connect(stack, client, carol["token"])
        _join_room(carol_ws, room_id)
        assert _next(alice_ws, "presence")["user_id"] == carol["user"]["id"]
        assert _next(bob_ws, "presence")["user_id"] == carol["user"]["id"]

        text = "أهلاً بالجميع في الغرفة"
        alice_ws.send_json({"type": "chat", "room_id": room_id, "text": text})

        received = {}
        for name, socket in (("alice", alice_ws), ("bob", bob_ws), ("carol", carol_ws)):
            event = _next(socket, "chat")
            assert event["room_id"] == room_id
            received[name] = event["message"]

        # نفس الرسالة (نفس المعرّف) تصل للجميع، بكاتبها ونصها الكامل.
        assert {message["id"] for message in received.values()} == {received["alice"]["id"]}
        for message in received.values():
            assert message["text"] == text
            assert message["sender_id"] == alice["user"]["id"]
            assert message["sender"]["username"] == "wsbroadcastalice"

        # ما وصل عبر Socket موجود في السجل الذي تقرأه الواجهة عبر REST.
        history = _history(client, bob, room_id)
        assert history[-1]["id"] == received["bob"]["id"]
        assert history[-1]["text"] == text


def test_ws_chat_stays_inside_its_room(client, make_user):
    """رسائل الغرفة لا تتسرب إلى غرفة أخرى متصلة في الوقت نفسه."""
    alice = make_user("wsscopealice")
    bob = make_user("wsscopebob")
    carol = make_user("wsscopecarol")
    dave = make_user("wsscopedave")
    room_a = _make_room(client, alice, "الغرفة الأولى")
    room_b = _make_room(client, carol, "الغرفة الثانية")
    _join_via_rest(client, bob, room_a)
    _join_via_rest(client, dave, room_b)

    with ExitStack() as stack:
        alice_ws, _ = _connect(stack, client, alice["token"])
        _join_room(alice_ws, room_a)
        bob_ws, _ = _connect(stack, client, bob["token"])
        _join_room(bob_ws, room_a)
        _next(alice_ws, "presence")

        carol_ws, _ = _connect(stack, client, carol["token"])
        _join_room(carol_ws, room_b)
        dave_ws, _ = _connect(stack, client, dave["token"])
        _join_room(dave_ws, room_b)
        _next(carol_ws, "presence")

        # رسالة الغرفة الأولى تُسلَّم لأعضائها فقط، ونتأكد أنها عولجت فعلاً.
        alice_ws.send_json({"type": "chat", "room_id": room_a, "text": "سر الغرفة الأولى"})
        assert _next(alice_ws, "chat")["message"]["text"] == "سر الغرفة الأولى"
        assert _next(bob_ws, "chat")["message"]["room_id"] == room_a

        # أول رسالة تصل ديف يجب أن تكون رسالة غرفته، لا رسالة الغرفة الأولى.
        carol_ws.send_json({"type": "chat", "room_id": room_b, "text": "رسالة الغرفة الثانية"})
        first_on_dave = dave_ws.receive_json()
        assert first_on_dave["type"] == "chat"
        assert first_on_dave["room_id"] == room_b
        assert first_on_dave["message"]["text"] == "رسالة الغرفة الثانية"
        assert _next(carol_ws, "chat")["message"]["room_id"] == room_b


def test_ws_leaving_a_room_stops_delivery(client, make_user):
    """بعد leave_room يتوقف تسليم رسائل الغرفة لهذا العميل."""
    alice = make_user("wsleavealice")
    bob = make_user("wsleavebob")
    room_id = _make_room(client, alice, "غرفة المغادرة")
    _join_via_rest(client, bob, room_id)

    with ExitStack() as stack:
        alice_ws, _ = _connect(stack, client, alice["token"])
        _join_room(alice_ws, room_id)
        bob_ws, _ = _connect(stack, client, bob["token"])
        _join_room(bob_ws, room_id)
        _next(alice_ws, "presence")

        bob_ws.send_json({"type": "leave_room", "room_id": room_id})
        # بقية الأعضاء يتلقون تحديث حالة الغرفة بعد المغادرة.
        assert _next(alice_ws, "room_state")["room"]["id"] == room_id

        alice_ws.send_json({"type": "chat", "room_id": room_id, "text": "بعد المغادرة"})
        # وصول الرسالة لأليس يثبت أن الخادم وزّعها قبل أن نختبر بوب.
        assert _next(alice_ws, "chat")["message"]["text"] == "بعد المغادرة"

        # أول حدث على اتصال بوب هو pong: لا رسالة دردشة سبقته.
        bob_ws.send_json({"type": "ping"})
        assert bob_ws.receive_json() == {"type": "pong"}


def test_ws_non_member_chat_is_dropped(client, make_user):
    """غير العضو لا ينضم ولا تُقبل رسالته ولا تُحفظ."""
    alice = make_user("wsguardalice")
    bob = make_user("wsguardbob")
    outsider = make_user("wsguardoutsider")
    room_id = _make_room(client, alice, "غرفة محروسة")
    _join_via_rest(client, bob, room_id)
    before = _history(client, alice, room_id)

    with ExitStack() as stack:
        alice_ws, _ = _connect(stack, client, alice["token"])
        _join_room(alice_ws, room_id)

        outsider_ws, _ = _connect(stack, client, outsider["token"])
        outsider_ws.send_json({"type": "join_room", "room_id": room_id})
        assert _next(outsider_ws, "error")["message"] == "لست عضواً في هذه الغرفة"

        outsider_ws.send_json({"type": "chat", "room_id": room_id, "text": "رسالة متطفل"})
        # pong على نفس الاتصال يثبت أن الخادم عالج رسالة المتطفل ورفضها.
        outsider_ws.send_json({"type": "ping"})
        assert outsider_ws.receive_json() == {"type": "pong"}

        # لا شيء وصل لأليس، وأول حدث لها هو pong.
        alice_ws.send_json({"type": "ping"})
        assert alice_ws.receive_json() == {"type": "pong"}

    assert _history(client, alice, room_id) == before


def test_ws_presence_and_state_follow_connections(client, make_user):
    """الانضمام يبثّ presence، وقطع الاتصال يحدّث حالة الغرفة للأعضاء الباقين."""
    from app.realtime import hub

    alice = make_user("wspresencealice")
    bob = make_user("wspresencebob")
    room_id = _make_room(client, alice, "غرفة الحضور")
    _join_via_rest(client, bob, room_id)

    with client.websocket_connect(f"/ws?token={alice['token']}") as alice_ws:
        assert alice_ws.receive_json()["type"] == "ready"
        _join_room(alice_ws, room_id)

        with client.websocket_connect(f"/ws?token={bob['token']}") as bob_ws:
            assert bob_ws.receive_json()["type"] == "ready"
            _join_room(bob_ws, room_id)
            presence = _next(alice_ws, "presence")
            assert presence["room_id"] == room_id
            assert presence["user_id"] == bob["user"]["id"]
            assert presence["online"] is True
            assert hub.is_online(bob["user"]["id"]) is True

        # انتهى اتصال بوب: أليس تتلقى حالة غرفة محدّثة ويُزال من سجل الاتصالات.
        state = _next(alice_ws, "room_state")["room"]
        assert state["id"] == room_id
        assert hub.is_online(bob["user"]["id"]) is False
        member_ids = {member["user"]["id"] for member in state["members"]}
        assert bob["user"]["id"] in member_ids
