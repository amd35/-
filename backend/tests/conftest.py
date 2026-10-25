"""Test bootstrap: a dedicated PostgreSQL database, seeded once per session."""
import os
from urllib.parse import urlsplit, urlunsplit

BASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://app:app@db:5432/app")
TEST_DB = os.environ.get("TEST_DB_NAME", os.environ.get("TEST_DATABASE_NAME", "app_test"))


def _with_database(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, f"/{name}", parts.query, parts.fragment))


TEST_URL = _with_database(BASE_URL, TEST_DB)
ADMIN_URL = _with_database(BASE_URL, "postgres")

os.environ["DATABASE_URL"] = TEST_URL
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_EMAIL"] = "admin@test.local"
os.environ["ADMIN_PASSWORD"] = "admin-test-pass"
os.environ["AUTO_CREATE_TABLES"] = "0"
os.environ["AUTO_SEED"] = "0"
os.environ["MEDIA_DIR"] = "/tmp/base44-test-media"
os.environ["RATE_LIMIT_DISABLED"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app.db import Base, SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session", autouse=True)
def _database():
    admin_engine = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as connection:
        exists = connection.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": TEST_DB}
        ).first()
        if not exists:
            connection.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    admin_engine.dispose()

    Base.metadata.drop_all(bind=engine)
    init_db()
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    yield


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


_counter = {"value": 0}


@pytest.fixture()
def make_user(client):
    def _make(username: str, password: str = "secret123"):
        _counter["value"] += 1
        response = client.post(
            "/api/auth/register",
            json={
                "username": username,
                "password": password,
                "email": f"{username}{_counter['value']}@test.local",
                "display_name": username,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _make


@pytest.fixture()
def admin_token(client):
    response = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "admin-test-pass"}
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]
