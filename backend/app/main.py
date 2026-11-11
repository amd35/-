import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Integer, String, create_engine, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg2://app:app@db:5432/appdb"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    handle: Mapped[str] = mapped_column(String(120))
    platform: Mapped[str] = mapped_column(String(40))
    url: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)


SEED = [
    {
        "name": "الصفحة الرسمية",
        "handle": "@official.page",
        "platform": "facebook",
        "url": "https://www.facebook.com/",
        "description": "الإعلانات الرسمية",
    },
    {
        "name": "الحساب الرسمي",
        "handle": "@official",
        "platform": "instagram",
        "url": "https://www.instagram.com/",
        "description": "الصور والقصص اليومية",
    },
    {
        "name": "القناة الرسمية",
        "handle": "@official",
        "platform": "youtube",
        "url": "https://www.youtube.com/",
        "description": "الفيديوهات والتوضيحات",
    },
    {
        "name": "قناة التليكرام",
        "handle": "@official",
        "platform": "telegram",
        "url": "https://telegram.org/",
        "description": "التنبيهات العاجلة",
    },
    {
        "name": "الموقع الرسمي",
        "handle": "official.site",
        "platform": "website",
        "url": "https://example.com/",
        "description": "الخدمات والاستمارات",
    },
]


def init_db() -> None:
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        if session.scalar(select(Account.id).limit(1)) is None:
            session.add_all([Account(**row) for row in SEED])
            session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    for attempt in range(15):
        try:
            init_db()
            break
        except OperationalError:
            if attempt == 14:
                raise
            time.sleep(2)
    yield


app = FastAPI(title="Official Accounts API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/accounts")
def list_accounts() -> list[dict[str, str | int | None]]:
    with Session(engine) as session:
        accounts = session.scalars(select(Account).order_by(Account.id)).all()
        return [
            {
                "id": a.id,
                "name": a.name,
                "handle": a.handle,
                "platform": a.platform,
                "url": a.url,
                "description": a.description,
            }
            for a in accounts
        ]
