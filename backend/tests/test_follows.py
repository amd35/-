"""المتابعة: علاقة أحادية الاتجاه، والعدّاد مشتق من الجدول لا مخزَّن."""
from conftest import auth


def test_follow_is_idempotent_and_counts_come_from_the_table(client, make_user):
    follower = make_user("followa")
    target = make_user("followb")
    target_id = client.get("/api/auth/me", headers=auth(target["token"])).json()["user"]["id"]

    assert client.get("/api/follows/summary", headers=auth(follower["token"])).json() == {
        "followers": 0,
        "following": 0,
    }

    first = client.post(f"/api/follows/{target_id}", headers=auth(follower["token"]))
    assert first.status_code == 200, first.text
    assert first.json()["created"] is True
    assert first.json()["summary"]["following"] == 1

    again = client.post(f"/api/follows/{target_id}", headers=auth(follower["token"]))
    assert again.status_code == 200
    assert again.json()["created"] is False
    assert again.json()["summary"]["following"] == 1

    followers = client.get(f"/api/follows/{target_id}/followers", headers=auth(follower["token"])).json()
    assert [row["username"] for row in followers["users"]] == ["followa"]
    assert followers["counts"]["followers"] == 1

    assert client.get("/api/follows/summary", headers=auth(target["token"])).json()["followers"] == 1

    removed = client.delete(f"/api/follows/{target_id}", headers=auth(follower["token"]))
    assert removed.status_code == 200
    assert removed.json()["following"] is False
    assert removed.json()["summary"]["following"] == 0
    assert client.get("/api/follows/summary", headers=auth(target["token"])).json()["followers"] == 0


def test_follow_rejects_self_and_unknown_members(client, make_user):
    member = make_user("followself")
    me = client.get("/api/auth/me", headers=auth(member["token"])).json()["user"]
    assert client.post(f"/api/follows/{me['id']}", headers=auth(member["token"])).status_code == 400
    assert client.post("/api/follows/999999", headers=auth(member["token"])).status_code == 404


def test_user_search_reports_whether_i_already_follow(client, make_user):
    viewer = make_user("searchfollowa")
    other = make_user("searchfollowb")
    other_id = client.get("/api/auth/me", headers=auth(other["token"])).json()["user"]["id"]

    found = client.get("/api/users/search?q=searchfollowb", headers=auth(viewer["token"])).json()["users"]
    assert found and found[0]["following"] is False

    client.post(f"/api/follows/{other_id}", headers=auth(viewer["token"]))
    found = client.get("/api/users/search?q=searchfollowb", headers=auth(viewer["token"])).json()["users"]
    assert found[0]["following"] is True
