from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create the schema when it is missing.

    Used by the bootstrap path (fresh container) and by the test suite. Real
    deployments apply the Alembic migrations in ``backend/alembic``.
    """
    from . import models  # noqa: F401  (register the mappers)

    Base.metadata.create_all(bind=engine)


def healthy() -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:  # pragma: no cover - only hit when the database is down
        return False
