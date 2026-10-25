"""TURN credentials for WebRTC, served to the clients through ``/api/meta/public``.

Two ways to give the clients a relay (needed for calls between different mobile
networks, where STUN alone cannot connect):

* static credentials — ``TURN_URL`` / ``TURN_USERNAME`` / ``TURN_CREDENTIAL``,
  handled by :meth:`app.config.Settings.ice_servers`;
* Cloudflare's TURN service (free, no server to run) — ``CLOUDFLARE_TURN_KEY_ID``
  and ``CLOUDFLARE_TURN_API_TOKEN``.  The long lived TURN key stays on the server and
  this module mints short lived credentials for the clients, so the credentials that
  reach a browser or the app stop working on their own.

The minted credentials are cached until shortly before they expire, so the public
meta endpoint stays fast, and any provider failure degrades to STUN only instead of
breaking it.  A credential is never logged.
"""
import json
import logging
import time
import urllib.request

from .config import settings

log = logging.getLogger(__name__)

CLOUDFLARE_ENDPOINT = "https://rtc.live.cloudflare.com/v1/turn/keys"
REQUEST_TIMEOUT_SECONDS = 4.0
EXPIRY_MARGIN_SECONDS = 600  # refresh ten minutes before the credentials expire
FAILURE_CACHE_SECONDS = 60  # do not hammer a failing provider on every request
MIN_CACHE_SECONDS = 30

_CACHE: dict = {"servers": [], "expires_at": 0.0}


def _fetch_cloudflare(key_id: str, api_token: str, ttl: int) -> list[dict] | None:
    """Ask Cloudflare for fresh credentials; ``None`` when they cannot be obtained."""
    request = urllib.request.Request(
        f"{CLOUDFLARE_ENDPOINT}/{key_id}/credentials/generate-ice-servers",
        data=json.dumps({"ttl": ttl}).encode(),
        headers={"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read() or b"{}")
    except Exception as exc:  # any failure must fall back to STUN only
        log.warning("Cloudflare TURN credentials unavailable (%s); using STUN only", type(exc).__name__)
        return None
    servers = payload.get("iceServers")
    if not isinstance(servers, list):
        log.warning("Unexpected Cloudflare TURN response; using STUN only")
        return None
    return [entry for entry in servers if isinstance(entry, dict) and entry.get("urls")]


def provider_ice_servers() -> list[dict]:
    """Cached TURN servers of the configured provider, empty when unavailable."""
    key_id = settings.turn_key_id
    api_token = settings.turn_key_api_token
    if not (key_id and api_token):
        return []

    now = time.monotonic()
    if now < _CACHE["expires_at"]:
        return _CACHE["servers"]

    ttl = max(settings.turn_credential_ttl, MIN_CACHE_SECONDS + EXPIRY_MARGIN_SECONDS)
    servers = _fetch_cloudflare(key_id, api_token, ttl)
    lifetime = (ttl - EXPIRY_MARGIN_SECONDS) if servers else FAILURE_CACHE_SECONDS
    _CACHE["servers"] = servers or []
    _CACHE["expires_at"] = now + max(lifetime, MIN_CACHE_SECONDS)
    return _CACHE["servers"]
