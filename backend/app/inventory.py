"""Cosmetic inventory: which items a user owns and which one is equipped.

No money moves here — every purchase goes through ``app.economy`` (wallet row
lock + ledger row). This module only records ownership and the equipped item.
"""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import StoreItem, UserItem

KINDS = ("dice", "theme")


def active_items(db: Session) -> list[StoreItem]:
    statement = select(StoreItem).where(StoreItem.active.is_(True)).order_by(StoreItem.sort, StoreItem.id)
    return list(db.execute(statement).scalars().all())


def get_item(db: Session, item_id: int) -> StoreItem:
    item = db.get(StoreItem, item_id)
    if item is None or not item.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "هذا العنصر غير متاح")
    return item


def owned_map(db: Session, user_id: int) -> dict[int, UserItem]:
    rows = db.execute(select(UserItem).where(UserItem.user_id == user_id)).scalars().all()
    return {row.item_id: row for row in rows}


def equipped_items(db: Session, user_id: int) -> list[tuple[StoreItem, UserItem]]:
    statement = (
        select(StoreItem, UserItem)
        .join(UserItem, UserItem.item_id == StoreItem.id)
        .where(UserItem.user_id == user_id, UserItem.equipped.is_(True))
    )
    return [(item, row) for item, row in db.execute(statement).all()]


def equip(db: Session, user_id: int, item: StoreItem, create: bool = False) -> UserItem:
    """Make ``item`` the equipped one for its kind.

    ``create`` adds the row on purchase; otherwise the item must be owned.
    """
    statement = (
        select(UserItem)
        .join(StoreItem, StoreItem.id == UserItem.item_id)
        .where(UserItem.user_id == user_id, StoreItem.kind == item.kind)
    )
    rows = list(db.execute(statement).scalars().all())
    row = next((candidate for candidate in rows if candidate.item_id == item.id), None)
    if row is None:
        if not create:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "هذا العنصر ليس في مخزونك")
        row = UserItem(user_id=user_id, item_id=item.id)
        db.add(row)
        rows.append(row)
    for candidate in rows:
        candidate.equipped = candidate.item_id == item.id
    return row
