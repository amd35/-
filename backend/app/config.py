"""Application settings, read from the environment.

No secret values live in the repository: everything here comes from the
environment (locally from docker-compose, in the sandbox from the platform
managed env file).
"""
import os


def _bool(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip() in {"1", "true", "True", "yes"}


class Settings:
    def __init__(self) -> None:
        self.app_name = os.getenv("APP_NAME", "يلا لوهان")
        self.secret_key = os.getenv("SECRET_KEY", "insecure-development-key")
        self.access_token_days = int(os.getenv("ACCESS_TOKEN_DAYS", "30"))
        self.database_url = os.getenv(
            "DATABASE_URL", "postgresql+psycopg://app:app@db:5432/app"
        )
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://localhost:3001",
            ).split(",")
            if origin.strip()
        ]
        self.media_dir = os.getenv("MEDIA_DIR", "/data/media")
        self.max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", "5"))
        # Throttling is always on for real traffic; the test suite switches it
        # off so its fixtures are not counted as abuse.
        self.rate_limit_disabled = _bool("RATE_LIMIT_DISABLED")

        # Bootstrap administrator (seeded on first start).
        self.admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
        self.admin_username = os.getenv("ADMIN_USERNAME", "admin")
        self.admin_password = os.getenv("ADMIN_PASSWORD", "")

        # Email delivery for verification / password reset. Without it the code
        # is still created and written to the server log, never emailed.
        self.smtp_host = os.getenv("SMTP_HOST", "")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587") or "587")
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.mail_from = os.getenv("MAIL_FROM", "no-reply@example.com")

        # Payments (Stripe). Empty means "not configured": the webhook refuses
        # and nothing is credited without a verified provider notification.
        self.stripe_secret_key = os.getenv("STRIPE_SECRET_KEY", "")
        self.stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

        # RTC. A public STUN server is enough for local testing; real calls
        # between mobile networks need a TURN server (see README).
        self.stun_url = os.getenv("STUN_URL", "stun:stun.l.google.com:19302")
        self.turn_url = os.getenv("TURN_URL", "")
        self.turn_username = os.getenv("TURN_USERNAME", "")
        self.turn_credential = os.getenv("TURN_CREDENTIAL", "")
        # Cloudflare TURN (free, nothing to run): the long lived key stays on the
        # server and app/rtc.py mints short lived credentials for the clients.
        self.turn_key_id = os.getenv("CLOUDFLARE_TURN_KEY_ID", "")
        self.turn_key_api_token = os.getenv("CLOUDFLARE_TURN_API_TOKEN", "")
        self.turn_credential_ttl = int(os.getenv("TURN_CREDENTIAL_TTL", "86400") or "86400")

        # Public URLs of the two web clients and the API, used in links and CORS.
        self.public_host_suffix = os.getenv("BASE44_PUBLIC_HOST_SUFFIX", "")
        self.web_origin = os.getenv("WEB_ORIGIN", "")
        self.admin_origin = os.getenv("ADMIN_ORIGIN", "")
        self.preview_mode = os.getenv("BASE44_PREVIEW_MODE") == "1"

    @property
    def payments_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_webhook_secret)

    @property
    def mail_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user)

    @property
    def turn_configured(self) -> bool:
        """True when clients are served a relay: a static TURN server or a TURN key."""
        return bool(self.turn_url or self.turn_key_id)

    def ice_servers(self) -> list[dict]:
        servers: list[dict] = [{"urls": self.stun_url}]
        if self.turn_url:
            servers.append(
                {
                    "urls": [part.strip() for part in self.turn_url.split(",") if part.strip()],
                    "username": self.turn_username,
                    "credential": self.turn_credential,
                }
            )
        return servers


settings = Settings()
