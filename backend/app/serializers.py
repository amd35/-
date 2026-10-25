"""Serializers: one JSON shape per entity, shared by REST and WebSocket."""
import datetime as dt
from typing import Any

from . import royal

LEVEL_STEP = 500


def level_for_xp(xp: int) -> int:
    level = 1
    remaining = max(xp, 0)
    while remaining >= LEVEL_STEP * level:
        remaining -= LEVEL_STEP * level
        level += 1
    return level


def xp_into_level(xp: int) -> int:
    level = 1
    remaining = max(xp, 0)
    while remaining >= LEVEL_STEP * level:
        remaining -= LEVEL_STEP * level
        level += 1
    return remaining


def next_level_xp(xp: int) -> int:
    return LEVEL_STEP * level_for_xp(xp)


def badges_for(user: Any, level: int) -> list[str]:
    badges = []
    if level >= 5:
        badges.append("خبير")
    if level >= 10:
        badges.append("نجم الغرف")
    if level >= 20:
        badges.append("أسطورة")
    royal_tier = royal.level_from_points(user.royal_points or 0)
    if royal_tier and royal_tier["level"] > 1:
        # شعار رويال: شارة المستوى الحقيقي من نظام رويال (لا شارة قديمة).
        badges.append(royal_tier["name_ar"])
    if user.is_admin:
        badges.append("الإدارة")
    return badges


def iso(value: dt.datetime | None) -> str | None:
    return value.isoformat() if value else None


def user_public(user: Any, online_override: bool | None = None) -> dict[str, Any]:
    level = level_for_xp(user.xp or 0)
    royal_tier = royal.level_from_points(user.royal_points or 0)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name or user.username,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "country": user.country,
        "locale": user.locale,
        "online": bool(user.online) if online_override is None else online_override,
        "level": level,
        "xp": user.xp or 0,
        "xp_into_level": xp_into_level(user.xp or 0),
        "next_level_xp": next_level_xp(user.xp or 0),
        "royal_points": user.royal_points or 0,
        "royal_level": royal_tier["level"] if royal_tier else 0,
        "royal_name": royal_tier["name_ar"] if royal_tier else "",
        "badges": badges_for(user, level),
        "is_admin": bool(user.is_admin),
        "admin_role": user.admin_role,
        "status": user.status,
        "created_at": iso(user.created_at),
    }


def user_private(user: Any) -> dict[str, Any]:
    payload = user_public(user)
    payload.update(
        {
            "email": user.email,
            "phone": user.phone,
            "email_verified": user.email_verified,
            "phone_verified": user.phone_verified,
            "notif_prefs": user.notif_prefs or {},
            "privacy": user.privacy or {},
            "voice_prefs": user.voice_prefs or {},
        }
    )
    return payload


def wallet_public(wallet: Any) -> dict[str, int]:
    return {"gold": wallet.gold, "diamonds": wallet.diamonds}


def ledger_public(entry: Any) -> dict[str, Any]:
    return {
        "id": entry.id,
        "currency": entry.currency,
        "amount": entry.amount,
        "balance_after": entry.balance_after,
        "kind": entry.kind,
        "note": entry.note,
        "counterparty_id": entry.counterparty_id,
        "created_at": iso(entry.created_at),
    }


def member_public(member: Any, user: Any) -> dict[str, Any]:
    return {
        "user": user_public(user),
        "role": member.role,
        "seat_index": member.seat_index,
        "mic_on": bool(member.mic_on),
        "muted_by_mod": bool(member.muted_by_mod),
        "can_ban": bool(member.can_ban),
        "joined_at": iso(member.joined_at),
    }


def room_public(
    room: Any,
    owner: Any,
    member_count: int,
    like_count: int = 0,
    liked_by_me: bool = False,
) -> dict[str, Any]:
    return {
        "id": room.id,
        "number": room.id,
        "name": room.name,
        "description": room.description,
        "image_url": room.image_url,
        "background": room.background,
        "rules": room.rules,
        "seat_count": room.seat_count,
        "is_private": bool(room.is_private),
        "password_required": bool(room.password_hash),
        "gifts_enabled": bool(room.gifts_enabled),
        "chat_enabled": bool(room.chat_enabled),
        "mic_settings": room.mic_settings or {},
        "locked_seats": room.locked_seats or [],
        "owner": user_public(owner),
        "member_count": member_count,
        "like_count": like_count,
        "liked_by_me": liked_by_me,
        "status": room.status,
        "created_at": iso(room.created_at),
    }


def gift_public(gift: Any) -> dict[str, Any]:
    return {
        "id": gift.id,
        "name": gift.name,
        "name_en": gift.name_en,
        "category": gift.category,
        "emoji": gift.emoji,
        "animation": gift.animation,
        "price_diamonds": gift.price_diamonds,
        "price_gold": gift.price_gold,
        "target": gift.target,
        "active": bool(gift.active),
        "sort": gift.sort,
    }


def notification_public(notification: Any) -> dict[str, Any]:
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "data": notification.data or {},
        "read": bool(notification.read),
        "created_at": iso(notification.created_at),
    }


def message_public(message: Any, sender: Any = None) -> dict[str, Any]:
    # DirectMessage stores sender_id, RoomMessage stores user_id.
    sender_id = getattr(message, "sender_id", None)
    if sender_id is None:
        sender_id = getattr(message, "user_id", None)
    payload = {
        "id": message.id,
        "text": message.text,
        "created_at": iso(message.created_at),
        "sender_id": sender_id,
    }
    if hasattr(message, "recipient_id"):
        payload["recipient_id"] = message.recipient_id
        payload["read_at"] = iso(message.read_at)
    if hasattr(message, "room_id"):
        payload["room_id"] = message.room_id
        payload["kind"] = message.kind
        payload["data"] = message.data or {}
    if sender is not None:
        payload["sender"] = user_public(sender)
    return payload


def order_public(order: Any) -> dict[str, Any]:
    return {
        "id": order.id,
        "user_id": order.user_id,
        "pack_id": order.pack_id,
        "currency": order.currency,
        "amount": order.amount,
        "royal_points": order.royal_points or 0,
        "price_amount": order.price_amount,
        "price_currency": order.price_currency,
        "provider": order.provider,
        "provider_ref": order.provider_ref,
        "status": order.status,
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
    }


def withdrawal_public(request: Any) -> dict[str, Any]:
    return {
        "id": request.id,
        "user_id": request.user_id,
        "currency": request.currency,
        "amount": request.amount,
        "fee": request.fee,
        "net_amount": request.net_amount,
        "payout_currency": request.payout_currency,
        "method": request.method,
        "beneficiary": request.beneficiary or {},
        "status": request.status,
        "admin_note": request.admin_note,
        "created_at": iso(request.created_at),
        "updated_at": iso(request.updated_at),
    }


def pack_public(pack: Any) -> dict[str, Any]:
    return {
        "id": pack.id,
        "kind": pack.kind,
        "name": pack.name,
        "amount": pack.amount,
        "bonus": pack.bonus,
        "total": pack.amount + pack.bonus,
        "royal_points": pack.royal_points or 0,
        "price_iqd": pack.price_iqd,
        "price_usd_cents": pack.price_usd_cents,
        "badge": pack.badge,
        "active": bool(pack.active),
        "sort": pack.sort,
    }


def item_public(item: Any, ownership: Any = None) -> dict[str, Any]:
    """A store cosmetic, plus whether this user owns / equipped it."""
    return {
        "id": item.id,
        "kind": item.kind,
        "name": item.name,
        "name_en": item.name_en,
        "description": item.description,
        "price_diamonds": item.price_diamonds,
        "price_gold": item.price_gold,
        "image_url": item.image_url,
        "accent": item.accent,
        "pips": item.pips,
        "active": bool(item.active),
        "sort": item.sort,
        "owned": ownership is not None,
        "equipped": bool(getattr(ownership, "equipped", False)),
    }


def report_public(report: Any) -> dict[str, Any]:
    return {
        "id": report.id,
        "reporter_id": report.reporter_id,
        "target_type": report.target_type,
        "target_id": report.target_id,
        "reason": report.reason,
        "details": report.details,
        "status": report.status,
        "handled_by": report.handled_by,
        "created_at": iso(report.created_at),
    }


def audit_public(entry: Any) -> dict[str, Any]:
    return {
        "id": entry.id,
        "actor_id": entry.actor_id,
        "action": entry.action,
        "target_type": entry.target_type,
        "target_id": entry.target_id,
        "details": entry.details or {},
        "created_at": iso(entry.created_at),
    }


def support_public(message: Any) -> dict[str, Any]:
    return {
        "id": message.id,
        "user_id": message.user_id,
        "topic": message.topic,
        "subject": message.subject,
        "body": message.body,
        "contact": message.contact,
        "status": message.status,
        "created_at": iso(message.created_at),
    }
