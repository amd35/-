"""Operator CLI for administrator accounts.

    python -m app.cli create-admin --username ops --email ops@example.com
    python -m app.cli reset-password --username ops

The password is read from --password, from $ADMIN_PASSWORD, or prompted for; it
is never printed and never stored in the repository.
"""
import argparse
import getpass
import os
import sys

from sqlalchemy import select

from .db import SessionLocal
from .models import User, Wallet
from .security import hash_password


def _password(explicit: str | None) -> str:
    value = explicit or os.getenv("ADMIN_PASSWORD") or ""
    if not value:
        value = getpass.getpass("password: ")
    if len(value) < 6:
        print("password must be at least 6 characters", file=sys.stderr)
        raise SystemExit(2)
    return value


def create_admin(username: str, email: str, password: str) -> int:
    db = SessionLocal()
    try:
        existing = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if existing is not None:
            existing.is_admin = True
            existing.admin_role = existing.admin_role or "owner"
            existing.password_hash = hash_password(password)
            db.commit()
            print(f"administrator '{username}' updated")
            return 0
        user = User(
            username=username,
            email=email or None,
            password_hash=hash_password(password),
            display_name="إدارة التطبيق",
            is_admin=True,
            admin_role="owner",
            status="active",
        )
        db.add(user)
        db.flush()
        db.add(Wallet(user_id=user.id, gold=0, diamonds=0))
        db.commit()
        print(f"administrator '{username}' created")
        return 0
    finally:
        db.close()


def reset_password(username: str, password: str) -> int:
    db = SessionLocal()
    try:
        user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if user is None:
            print(f"no user named '{username}'", file=sys.stderr)
            return 1
        user.password_hash = hash_password(password)
        db.commit()
        print(f"password updated for '{username}'")
        return 0
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-admin", help="create or promote an administrator")
    create.add_argument("--username", required=True)
    create.add_argument("--email", default="")
    create.add_argument("--password", default=None)

    reset = sub.add_parser("reset-password", help="set a new password for any account")
    reset.add_argument("--username", required=True)
    reset.add_argument("--password", default=None)

    args = parser.parse_args(argv)
    password = _password(args.password)

    if args.command == "create-admin":
        return create_admin(args.username, args.email, password)
    return reset_password(args.username, password)


if __name__ == "__main__":
    raise SystemExit(main())
