"""Changing the administrator password from inside the panel — and it staying changed."""
from conftest import auth

from app.config import settings
from app.db import SessionLocal
from app.seed import seed


def _login(client, password):
    return client.post("/api/auth/login", json={"identifier": "admin", "password": password})


def _reseed():
    """Simulate an API restart: the seed runs again over the same database."""
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


def test_password_change_requires_the_current_password(client, admin_token):
    response = client.post(
        "/api/auth/password/change",
        json={"current_password": "wrong-current", "new_password": "another-strong-pass"},
        headers=auth(admin_token),
    )
    assert response.status_code == 400
    assert _login(client, settings.admin_password).status_code == 200


def test_panel_password_change_survives_restarts_and_secret_rotation(client, admin_token):
    original = settings.admin_password
    try:
        changed = client.post(
            "/api/auth/password/change",
            json={"current_password": original, "new_password": "panel-owned-pass"},
            headers=auth(admin_token),
        )
        assert changed.status_code == 200, changed.text
        assert _login(client, original).status_code == 401
        assert _login(client, "panel-owned-pass").status_code == 200

        # A restart re-runs the seed: the password changed from the panel survives it.
        _reseed()
        assert _login(client, "panel-owned-pass").status_code == 200

        # A new secret value still overrides it: the lost-password recovery path.
        settings.admin_password = "rotated-env-pass"
        _reseed()
        assert _login(client, "panel-owned-pass").status_code == 401
        assert _login(client, "rotated-env-pass").status_code == 200
    finally:
        settings.admin_password = original
        _reseed()


def test_internal_password_marker_stays_out_of_the_settings_api(client, admin_token):
    payload = client.get("/api/admin/settings", headers=auth(admin_token)).json()["settings"]
    assert not [key for key in payload if key.startswith("_")]
