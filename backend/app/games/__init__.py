"""Server-side game engines (Ludo, Domino).

The rules live in pure modules (``ludo``, ``domino``); ``service`` wires them to
the database, the realtime hub and the reward system.
"""
from . import domino, ludo  # noqa: F401

ENGINES = {"ludo": ludo, "domino": domino}
GAME_NAMES = {"ludo": "لودو", "domino": "دومينو"}
