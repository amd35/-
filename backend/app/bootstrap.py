"""تهيئة قاعدة البيانات: الجداول والأعمدة الأساسية فقط — بلا أي بيانات تجريبية."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import engine
from .models import Base, Profile, now_iso


def _add_column(connection, table: str, column: str, ddl: str) -> None:
    if connection.dialect.name != "postgresql":
        return
    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}"))


def prepare_database() -> None:
    Base.metadata.create_all(engine)

    # أعمدة أُضيفت بعد أول إصدار؛ تُبقي قواعد البيانات القائمة متوافقة.
    with engine.begin() as connection:
        _add_column(connection, "friends", "last_seen", "VARCHAR(40)")
        _add_column(connection, "rooms", "created_at", "VARCHAR(40)")
        connection.execute(
            text("UPDATE rooms SET created_at = :ts WHERE created_at IS NULL"),
            {"ts": now_iso()},
        )

    # سجل الملف الشخصي الوحيد مطلوب لتشغيل التطبيق؛ بقية السجلات تُنشأ من الاستخدام الحقيقي.
    with Session(engine) as session:
        if session.get(Profile, 1) is None:
            session.add(Profile(id=1))
            session.commit()
