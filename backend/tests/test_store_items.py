"""The in-app cosmetic store: wallet debits, inventory and equipping."""
from conftest import auth


def _credit(client, admin_token, user_id: int, currency: str, amount: int) -> None:
    response = client.post(
        f"/api/admin/users/{user_id}/wallet",
        json={"currency": currency, "amount": amount, "note": "رصيد اختبار"},
        headers=auth(admin_token),
    )
    assert response.status_code in (200, 201), response.text


def _dice(client, token) -> list[dict]:
    listing = client.get("/api/store/cosmetics", headers=auth(token))
    assert listing.status_code == 200, listing.text
    return [item for item in listing.json()["items"] if item["kind"] == "dice"]


def test_buying_a_dice_debits_the_wallet_and_fills_the_inventory(client, make_user, admin_token):
    user = make_user("dicelover")
    token = user["token"]
    dice = _dice(client, token)
    assert dice, "the seeded dice catalogue must not be empty"
    item = dice[0]
    assert item["owned"] is False and item["equipped"] is False

    # No balance -> the server refuses and nothing is given away.
    poor = client.post(
        f"/api/store/cosmetics/{item['id']}/purchase", json={"currency": "diamonds"}, headers=auth(token)
    )
    assert poor.status_code == 400, poor.text
    assert "الرصيد غير كافٍ" in poor.json()["detail"]

    before = client.get("/api/wallet", headers=auth(token)).json()["wallet"]["diamonds"]
    _credit(client, admin_token, user["user"]["id"], "diamonds", item["price_diamonds"] + 500)
    left = before + 500

    bought = client.post(
        f"/api/store/cosmetics/{item['id']}/purchase", json={"currency": "diamonds"}, headers=auth(token)
    )
    assert bought.status_code == 201, bought.text
    body = bought.json()
    assert body["created"] is True
    assert body["balances"]["diamonds"] == left
    assert body["item"]["owned"] is True and body["item"]["equipped"] is True
    assert body["ledger"]["kind"] == "store_item"
    assert body["ledger"]["amount"] == -item["price_diamonds"]
    assert body["ledger"]["balance_after"] == left

    # Replaying the same purchase returns the stored rows and never charges twice.
    replay = client.post(
        f"/api/store/cosmetics/{item['id']}/purchase", json={"currency": "diamonds"}, headers=auth(token)
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["created"] is False
    assert replay.json()["balances"]["diamonds"] == left

    # Balance, ledger and inventory agree with the database.
    assert client.get("/api/wallet", headers=auth(token)).json()["wallet"]["diamonds"] == left
    entries = client.get("/api/wallet/ledger", headers=auth(token)).json()["entries"]
    assert entries[0]["kind"] == "store_item"
    equipped = client.get("/api/auth/me", headers=auth(token)).json()["equipped_items"]
    assert [row["id"] for row in equipped] == [item["id"]]


def test_only_one_dice_is_equipped_and_unowned_items_are_refused(client, make_user, admin_token):
    user = make_user("equipper")
    token = user["token"]
    dice = _dice(client, token)
    assert len(dice) >= 2
    first, second = dice[0], dice[1]

    refused = client.post(f"/api/store/cosmetics/{second['id']}/equip", headers=auth(token))
    assert refused.status_code == 403, refused.text

    _credit(client, admin_token, user["user"]["id"], "diamonds", first["price_diamonds"] + second["price_diamonds"])
    for item in (first, second):
        paid = client.post(
            f"/api/store/cosmetics/{item['id']}/purchase", json={"currency": "diamonds"}, headers=auth(token)
        )
        assert paid.status_code == 201, paid.text

    switched = client.post(f"/api/store/cosmetics/{first['id']}/equip", headers=auth(token))
    assert switched.status_code == 200, switched.text
    assert switched.json()["item"]["equipped"] is True

    owned = {row["id"]: row for row in _dice(client, token)}
    assert owned[first["id"]]["equipped"] is True
    assert owned[second["id"]]["equipped"] is False
    assert owned[second["id"]]["owned"] is True

    # The gold-priced dice is sold for gold, from the same wallet row.
    with_gold = next(item for item in dice if item["price_gold"] > 0)
    _credit(client, admin_token, user["user"]["id"], "gold", with_gold["price_gold"] + 2)
    gold_buy = client.post(
        f"/api/store/cosmetics/{with_gold['id']}/purchase", json={"currency": "gold"}, headers=auth(token)
    )
    assert gold_buy.status_code == 201, gold_buy.text
    assert gold_buy.json()["balances"]["gold"] == 2
    assert gold_buy.json()["ledger"]["currency"] == "gold"
