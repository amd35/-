"""حدود المعدل على المسارات المالية: إرسال الهدايا وتحويل الرصيد.

الاختبارات كلها تعمل و`RATE_LIMIT_DISABLED=1` (انظر conftest)، لذلك يفعّل
fixture `limiter` الحدّ محليًا ثم ينظّف الدلاء بعده فلا يتأثر أي اختبار آخر.
العدّاد في الإنتاج مشترك عبر Redis؛ اختبارات المسارات هنا تعمل على العدّاد المحلي
(البديل عند غياب Redis) بينما تختبر مجموعة `shared_counters` العدّاد المشترك نفسه.

الحدود ثلاث طبقات لكل مسار: رشقة سريعة، سقف نافذة أطول، وسقف لكل (مرسِل، هدف).
الاختبارات هنا تثبت كل طبقة على حدة وتتحقق من ترويسة `Retry-After` ومن أن العدّاد
محصّن ضد الطلبات المتزامنة (المسارات المتزامنة تعمل في thread pool).
"""
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
import redis
from fastapi import HTTPException

from app import security
from conftest import auth

# عدّاد مشترك حقيقي: نفس خدمة Redis في compose، على قاعدة منفصلة حتى لا تتقاطع
# مفاتيح الاختبار مع عدّادات التطبيق.
TEST_REDIS_URL = os.environ.get("REDIS_TEST_URL", "redis://redis:6379/15")


@pytest.fixture()
def limiter(monkeypatch):
    """العدّاد المحلي فقط: اختبارات المسارات لا تحتاج خدمة Redis."""
    monkeypatch.setattr(security.settings, "rate_limit_disabled", False)
    monkeypatch.setattr(security.settings, "redis_url", "")
    security.reset_rate_limits()
    try:
        yield security
    finally:
        security.reset_rate_limits()


@pytest.fixture()
def shared_counters(monkeypatch):
    """يشغّل العدّاد المشترك على Redis الحقيقي، ويُتخطّى إن لم تكن الخدمة متاحة."""
    client = redis.Redis.from_url(
        TEST_REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=0.3,
        socket_timeout=0.3,
    )
    try:
        client.ping()
    except redis.RedisError:
        pytest.skip("Redis غير متاح: اختبار العدّاد المشترك يحتاج خدمة redis")
    client.flushdb()
    monkeypatch.setattr(security.settings, "rate_limit_disabled", False)
    monkeypatch.setattr(security.settings, "redis_url", TEST_REDIS_URL)
    security.reset_rate_limits()
    try:
        yield client
    finally:
        security.reset_rate_limits()
        client.flushdb()


# --- آلة الحدّ نفسها -------------------------------------------------------


def test_rate_limit_counts_each_key_separately(limiter):
    limiter.rate_limit("key-a", limit=1, window_seconds=60)
    limiter.rate_limit("key-b", limit=1, window_seconds=60)
    with pytest.raises(HTTPException) as excinfo:
        limiter.rate_limit("key-a", limit=1, window_seconds=60)
    assert excinfo.value.status_code == 429


def test_rate_limit_slides_the_window(monkeypatch, limiter):
    clock = {"now": 1000.0}
    monkeypatch.setattr(security.time, "monotonic", lambda: clock["now"])
    limiter.rate_limit("slide", limit=2, window_seconds=10)
    limiter.rate_limit("slide", limit=2, window_seconds=10)
    with pytest.raises(HTTPException):
        limiter.rate_limit("slide", limit=2, window_seconds=10)
    clock["now"] += 11
    limiter.rate_limit("slide", limit=2, window_seconds=10)


def test_rate_limit_sets_retry_after(limiter):
    limiter.rate_limit("retry", limit=1, window_seconds=30)
    with pytest.raises(HTTPException) as excinfo:
        limiter.rate_limit("retry", limit=1, window_seconds=30)
    retry_after = int(excinfo.value.headers["Retry-After"])
    assert 1 <= retry_after <= 30


def test_rate_limit_is_thread_safe(limiter):
    """طلبات متزامنة لا يجب أن تتجاوز الحدّ: بدون القفل يمرّ أكثر من limit."""
    allowed = []

    def hit(_):
        try:
            limiter.rate_limit("threads", limit=25, window_seconds=60)
            allowed.append(1)
        except HTTPException as exc:
            assert exc.status_code == 429

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(hit, range(120)))

    assert len(allowed) == 25


# --- إرسال الهدايا ---------------------------------------------------------


def test_gift_burst_is_throttled_per_member(client, make_user, limiter):
    sender = make_user("giftburst")
    headers = auth(sender["token"])
    # هدية غير موجودة: الطلب يُرفض بـ 404 لكنه يستهلك الحدّ (القفل قبل أي عمل
    # على المحفظة). نغيّر المستلم كل مرة حتى لا يوقفنا سقف الهدف قبل سقف الرشقة.
    codes = [
        client.post(
            "/api/gifts/send",
            json={"gift_id": 999999, "receiver_id": 900000 + i, "idempotency_key": f"burst-{i}"},
            headers=headers,
        ).status_code
        for i in range(10)
    ]
    assert set(codes) == {404}, codes

    blocked = client.post(
        "/api/gifts/send",
        json={"gift_id": 999999, "receiver_id": 900099, "idempotency_key": "burst-blocked"},
        headers=headers,
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1

    # الحدّ لكل عضو لا لكل التطبيق: عضو آخر ما زال يمرّ إلى منطق المسار.
    other = make_user("giftburst2")
    allowed = client.post(
        "/api/gifts/send",
        json={"gift_id": 999999, "receiver_id": 900098, "idempotency_key": "burst-other"},
        headers=auth(other["token"]),
    )
    assert allowed.status_code == 404


def test_gift_target_is_throttled_per_recipient(client, make_user, limiter):
    sender = make_user("giftswap")
    victim = make_user("giftvictim")
    headers = auth(sender["token"])
    body = {"gift_id": 999999, "receiver_id": victim["user"]["id"]}
    codes = [
        client.post(
            "/api/gifts/send", json={**body, "idempotency_key": f"target-{i}"}, headers=headers
        ).status_code
        for i in range(8)
    ]
    assert set(codes) == {404}, codes

    blocked = client.post(
        "/api/gifts/send", json={**body, "idempotency_key": "target-blocked"}, headers=headers
    )
    assert blocked.status_code == 429

    # العدّاد لكل (مرسِل، هدف): عضو آخر يستطيع إرسال هدية لنفس المستلم.
    other = make_user("giftswap2")
    allowed = client.post(
        "/api/gifts/send",
        json={**body, "idempotency_key": "target-other"},
        headers=auth(other["token"]),
    )
    assert allowed.status_code == 404


# --- تحويل الرصيد ----------------------------------------------------------


def test_transfer_burst_is_throttled_per_member(client, make_user, limiter):
    sender = make_user("txburst")
    headers = auth(sender["token"])
    body = {"to_username": "ghost-user", "currency": "diamonds", "amount": 1}
    codes = [client.post("/api/wallet/transfer", json=body, headers=headers).status_code for _ in range(6)]
    assert set(codes) == {404}, codes

    blocked = client.post("/api/wallet/transfer", json=body, headers=headers)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1

    other = make_user("txburst2")
    allowed = client.post(
        "/api/wallet/transfer", json=body, headers=auth(other["token"])
    )
    assert allowed.status_code == 404


def test_transfer_to_same_member_is_capped(client, make_user, limiter):
    sender = make_user("txpair")
    friend = make_user("txpairfriend")
    headers = auth(sender["token"])
    body = {"to_username": friend["user"]["username"], "currency": "diamonds", "amount": 1}
    for i in range(5):
        ok = client.post(
            "/api/wallet/transfer", json={**body, "idempotency_key": f"pair-{i}"}, headers=headers
        )
        assert ok.status_code == 201, ok.text

    # سادس تحويل لنفس الشخص مسدود بسقف الزوج (الرشقة تسمح 6).
    blocked = client.post(
        "/api/wallet/transfer", json={**body, "idempotency_key": "pair-blocked"}, headers=headers
    )
    assert blocked.status_code == 429

    # مرسِل آخر إلى نفس المستلم يمرّ: العدّاد لكل زوج وليس لكل مستلم.
    other = make_user("txpair2")
    ok = client.post(
        "/api/wallet/transfer",
        json={**body, "idempotency_key": "pair-other"},
        headers=auth(other["token"]),
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["wallet"]["diamonds"] == 1000 - 1


def test_transfer_still_works_under_the_limit(client, make_user, limiter):
    sender = make_user("txok")
    friend = make_user("txokfriend")
    ok = client.post(
        "/api/wallet/transfer",
        json={
            "to_username": friend["user"]["username"],
            "currency": "diamonds",
            "amount": 10,
            "idempotency_key": "tx-allowed",
        },
        headers=auth(sender["token"]),
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["wallet"]["diamonds"] == 1000 - 10
    assert ok.json()["recipient"]["id"] == friend["user"]["id"]


# --- العدّاد المشترك عبر Redis (عدة عمليات/نسخ) -----------------------------


def test_counter_is_shared_through_redis(shared_counters):
    key = f"shared-{uuid.uuid4().hex}"
    for _ in range(3):
        security.rate_limit(key, limit=3, window_seconds=60)

    with pytest.raises(HTTPException) as excinfo:
        security.rate_limit(key, limit=3, window_seconds=60)
    assert excinfo.value.status_code == 429
    assert int(excinfo.value.headers["Retry-After"]) >= 1

    # النافذة كُتبت في Redis لا في ذاكرة العملية: أي عامل آخر يقرأ نفس العدّاد.
    assert shared_counters.zcard(f"{security._REDIS_KEY_PREFIX}{key}") == 3
    assert key not in security._attempts


def test_shared_counter_expires_with_the_window(shared_counters):
    key = f"expire-{uuid.uuid4().hex}"
    security.rate_limit(key, limit=1, window_seconds=1)
    with pytest.raises(HTTPException):
        security.rate_limit(key, limit=1, window_seconds=1)
    time.sleep(1.2)
    security.rate_limit(key, limit=1, window_seconds=1)


def test_unreachable_redis_falls_back_to_local_counter(monkeypatch):
    monkeypatch.setattr(security.settings, "rate_limit_disabled", False)
    monkeypatch.setattr(security.settings, "redis_url", "redis://127.0.0.1:1/0")
    security.reset_rate_limits()
    try:
        security.rate_limit("fallback", limit=1, window_seconds=60)
        assert "fallback" in security._attempts
        with pytest.raises(HTTPException) as excinfo:
            security.rate_limit("fallback", limit=1, window_seconds=60)
        assert excinfo.value.status_code == 429
    finally:
        security.reset_rate_limits()
