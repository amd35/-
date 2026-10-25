"""FastAPI application entry point."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import SessionLocal, init_db
from .realtime import hub
from .routers import (
    admin,
    auth,
    follows,
    friends,
    games,
    gifts,
    meta,
    notifications,
    payments,
    rooms,
    royal,
    store,
    support,
    users,
    wallet,
)
from .seed import seed
from .ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    hub.bind_loop(asyncio.get_running_loop())
    os.makedirs(settings.media_dir, exist_ok=True)
    if os.getenv("AUTO_CREATE_TABLES", "1") == "1":
        init_db()
    if os.getenv("AUTO_SEED", "1") == "1":
        db = SessionLocal()
        try:
            seed(db)
        finally:
            db.close()
    log.info("API ready (preview_mode=%s, mail=%s, payments=%s)", settings.preview_mode, settings.mail_configured, settings.payments_configured)
    yield


app = FastAPI(
    title="TON Voice API",
    version="0.1.0",
    description="Backend for the social voice-room application (accounts, rooms, gifts, wallet, admin).",
    lifespan=lifespan,
)

allowed_origins = list(settings.cors_origins)
for origin in (settings.web_origin, settings.admin_origin):
    if origin:
        allowed_origins.append(origin)
if settings.public_host_suffix:
    allowed_origins.extend(
        [
            f"https://3000-{settings.public_host_suffix}",
            f"https://3001-{settings.public_host_suffix}",
        ]
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(rooms.router)
app.include_router(gifts.router)
app.include_router(wallet.router)
app.include_router(royal.router)
app.include_router(store.router)
app.include_router(support.router)
app.include_router(friends.router)
app.include_router(follows.router)
app.include_router(games.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(payments.router)
app.include_router(ws_router)

app.mount("/media", StaticFiles(directory=settings.media_dir, check_dir=False), name="media")
