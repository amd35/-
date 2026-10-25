"""The admin command panel: /api/admin/stats reports real users, tables and balance movements."""
from conftest import auth


def test_admin_stats_reject_non_administrators(client, make_user):
    plain = make_user("statsplain")
    assert client.get("/api/admin/stats", headers=auth(plain["token"])).status_code == 403


def test_admin_stats_report_activity_tables_and_wallet_flow(client, admin_token, make_user):
    admin = auth(admin_token)
    before = client.get("/api/admin/stats", headers=admin).json()

    sender = make_user("statsgiver")
    receiver = make_user("statsreceiver")
    table = client.post(
        "/api/games/rooms",
        json={"game": "ludo", "name": "طاولة الاختبار"},
        headers=auth(sender["token"]),
    )
    assert table.status_code == 201, table.text
    table_id = table.json()["room"]["id"]

    # Registration pays a welcome bonus, so the wallet baseline is read after both
    # accounts exist: the only movement left is the transfer itself.
    before_wallet = client.get("/api/admin/stats", headers=admin).json()["wallet"]

    moved = client.post(
        "/api/wallet/transfer",
        json={
            "to_username": "statsreceiver",
            "currency": "coins",
            "amount": 100,
            "idempotency_key": "stats-dashboard-flow",
        },
        headers=auth(sender["token"]),
    )
    assert moved.status_code == 201, moved.text

    after = client.get("/api/admin/stats", headers=admin).json()

    # New sections of the dashboard payload.
    assert {"generated_at", "activity", "game_rooms", "wallet"} <= set(after)
    assert after["activity"]["active_today"] >= before["activity"]["active_today"]
    assert after["activity"]["seated"] >= 0

    # The table just created is reported as an active one.
    assert after["game_rooms"]["waiting"] == before["game_rooms"]["waiting"] + 1
    assert after["game_rooms"]["live"] == after["game_rooms"]["waiting"] + after["game_rooms"]["playing"]
    assert table_id in [row["id"] for row in after["game_rooms"]["tables"]]

    # The transfer shows up as two movements in the 24h flow, both of them in-app.
    assert after["wallet"]["flow"]["coins"]["entries"] == before_wallet["flow"]["coins"]["entries"] + 2
    assert after["wallet"]["flow"]["coins"]["net"] == before_wallet["flow"]["coins"]["net"]
    assert after["wallet"]["flow"]["coins"]["out"] == before_wallet["flow"]["coins"]["out"] + 100
    assert after["wallet"]["flow"]["coins"]["in"] == before_wallet["flow"]["coins"]["in"] + 100
    assert {"statsgiver", "statsreceiver"} <= {row["username"] for row in after["wallet"]["recent"]}
