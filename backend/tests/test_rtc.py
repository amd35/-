"""TURN credentials minted for the clients (app/rtc.py)."""
import pytest

from app import rtc
from app.config import settings

CLOUDFLARE_SERVERS = [
    {
        "urls": ["turn:turn.cloudflare.com:443?transport=tcp", "turns:turn.cloudflare.com:5349?transport=tcp"],
        "username": "minted-user",
        "credential": "minted-credential",
    }
]


@pytest.fixture(autouse=True)
def _empty_cache(monkeypatch):
    monkeypatch.setattr(rtc, "_CACHE", {"servers": [], "expires_at": 0.0})


@pytest.fixture()
def _configured(monkeypatch):
    monkeypatch.setattr(settings, "turn_key_id", "turn-key-id")
    monkeypatch.setattr(settings, "turn_key_api_token", "turn-key-api-token")


def test_nothing_is_fetched_without_a_provider_key(monkeypatch):
    monkeypatch.setattr(settings, "turn_key_id", "")
    monkeypatch.setattr(settings, "turn_key_api_token", "")
    calls = []
    monkeypatch.setattr(rtc, "_fetch_cloudflare", lambda *args: calls.append(args))
    assert rtc.provider_ice_servers() == []
    assert calls == []


def test_minted_credentials_are_cached(_configured, monkeypatch):
    calls = []

    def fake_fetch(key_id, api_token, ttl):
        calls.append((key_id, api_token, ttl))
        return CLOUDFLARE_SERVERS

    monkeypatch.setattr(rtc, "_fetch_cloudflare", fake_fetch)
    first = rtc.provider_ice_servers()
    second = rtc.provider_ice_servers()
    assert first == CLOUDFLARE_SERVERS
    assert second == CLOUDFLARE_SERVERS
    assert calls == [("turn-key-id", "turn-key-api-token", 86400)], "the provider is asked once"


def test_provider_failure_degrades_to_stun_only(_configured, monkeypatch):
    calls = []
    monkeypatch.setattr(rtc, "_fetch_cloudflare", lambda *args: calls.append(args))
    assert rtc.provider_ice_servers() == []
    assert rtc.provider_ice_servers() == []
    assert len(calls) == 1, "a failure is remembered instead of retried on every request"


def test_meta_public_serves_the_minted_servers(client, _configured, monkeypatch):
    monkeypatch.setattr(rtc, "_fetch_cloudflare", lambda *args: CLOUDFLARE_SERVERS)
    payload = client.get("/api/meta/public").json()
    assert payload["turn_configured"] is True
    assert payload["ice_servers"][0]["urls"] == settings.stun_url
    assert CLOUDFLARE_SERVERS[-1] in payload["ice_servers"]
