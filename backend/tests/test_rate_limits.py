"""حدود المعدل على المسارات المالية: إرسال الهدايا وتحويل الرصيد.

الاختبارات كلها تعمل و`RATE_LIMIT_DISABLED=1` (انظر conftest)، لذلك يفعّل
fixture `limiter` الحدّ محليًا ثم ينظّف الدلاء بعده فلا يتأثر أي اختبار آخر.
"""
import pytest

from app import security
from conftest import auth


@pytest.fixture()
def limiter():
    security._attempts.clear()
    previous = security.settings.rate_limit_disabled
    security.settings.rate_limit_disabled = False
    try:
        yield security
    finally:
        security.settings.rate_limit_disabled = previous
        security._attempts.clear()


def test_gift_sending_is_throttled_per_member(client, make_user, limiter):
    sender = make_user("giftflood")
    headers = auth(sender["token"])
    # هدية غير موجودة: الطلب يُرفض بـ 404 لكنه يستهلك الحدّ (القفل قبل أي عمل على المحفظة).
    body = {"gift_id": 999999, "receiver_id": sender["user"]["id"]}
    codes = [
        client.post("/api/gifts/send", json={**body, "idempotency_key": f"flood-{i}"}, headers=headers).status_code
        for i in range(60)
    ]
    assert set(codes) == {404}, codes

    blocked = client.post("/api/gifts/send", json={**body, "idempotency_key": "flood-blocked"}, headers=headers)
    assert blocked.status_code == 429

    # الحدّ لكل عضو لا لكل التطبيق: عضو آخر ما زال يمرّ إلى منطق المسار.
    other = make_user("giftflood2")
    allowed = client.post(
        "/api/gifts/send", json={**body, "idempotency_key": "other-1"}, headers=auth(other["token"])
    )
    assert allowed.status_code == 404


def test_transfers_are_throttled_per_member(client, make_user, limiter):
    sender = make_user("txflood")
    headers = auth(sender["token"])
    body = {"to_username": "ghost-user", "currency": "diamonds", "amount": 1}
    codes = [client.post("/api/wallet/transfer", json=body, headers=headers).status_code for _ in range(20)]
    assert set(codes) == {404}, codes

    blocked = client.post("/api/wallet/transfer", json=body, headers=headers)
    assert blocked.status_code == 429

    # تحت الحدّ يبقى التحويل الحقيقي يعمل ويخصم من الرصيد مرة واحدة.
    friend = make_user("txfriend")
    ok = client.post(
        "/api/wallet/transfer",
        json={
            "to_username": sender["user"]["username"],
            "currency": "diamonds",
            "amount": 10,
            "idempotency_key": "tx-allowed",
        },
        headers=auth(friend["token"]),
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["wallet"]["diamonds"] == 1000 - 10
    assert ok.json()["recipient"]["id"] == sender["user"]["id"]
