import os

from sqlalchemy import create_engine

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg2://app:app@db:5432/appdb"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
