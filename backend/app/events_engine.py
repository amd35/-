"""محرك الألعاب: العشوائية والنتائج والتقييم تحدث على الخادم فقط.

لا يُرسل مفتاح الإجابات الصحيحة للواجهة، ولا تُقبل نتيجة محسوبة من العميل.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

EVENT_KINDS = {
    "daily": "فعالية يومية",
    "weekly": "فعالية أسبوعية",
    "competition": "مسابقة",
    "challenge": "تحدٍ",
    "occasion": "مناسبة",
    "exclusive": "فعالية حصرية",
    "game": "لعبة",
}

PRIZE_KINDS = {
    "gold": "ذهب",
    "coins": "عملات",
    "diamonds": "ألماس",
    "gift": "هدية",
    "frame": "إطار",
}

EVENT_STATUSES = {"draft", "active", "paused", "ended"}
MEDIA_TYPES = {"image", "video"}

GAME_CATALOG: list[dict] = [
    {
        "key": "lucky_challenge",
        "name": "تحدي الحظ",
        "description": "ارمِ النرد واحصل على نقاط حسب النتيجة.",
        "rules": "ارمِ النرد مرة واحدة. النتيجة من 1 إلى 6 وتُضرب في 100 نقطة، مع مكافأة حظ إضافية.",
        "duration_seconds": 30,
        "sort_order": 1,
    },
    {
        "key": "prize_wheel",
        "name": "عجلة الجوائز",
        "description": "أدر العجلة واقبل القطاع الذي يتوقف عليه المؤشر.",
        "rules": "تدور العجلة على الخادم وتتوقف على قطاع واحد. النقاط المكتوبة على القطاع هي نتيجتك.",
        "duration_seconds": 45,
        "sort_order": 2,
    },
    {
        "key": "mystery_box",
        "name": "صندوق المفاجآت",
        "description": "اختر صندوقًا واحدًا من ثلاثة واكشف ما بداخله.",
        "rules": "اختر صندوقًا واحدًا. الخادم يكشف محتواه: نقاط أو هدية مفاجئة.",
        "duration_seconds": 30,
        "sort_order": 3,
    },
    {
        "key": "points_challenge",
        "name": "تحدي جمع النقاط",
        "description": "خمس جولات سريعة تجمع فيها أكبر عدد من النقاط.",
        "rules": "خمس جولات تُحسب على الخادم. مجموع النقاط في نهاية الجولات هو نتيجتك.",
        "duration_seconds": 60,
        "sort_order": 4,
    },
    {
        "key": "quiz",
        "name": "مسابقة الأسئلة",
        "description": "أجب عن أسئلة عامة قبل انتهاء الوقت.",
        "rules": "خمسة أسئلة، لكل سؤال إجابة واحدة صحيحة. تُقيَّم الإجابات على الخادم مع مكافأة سرعة.",
        "duration_seconds": 120,
        "sort_order": 5,
    },
    {
        "key": "group_game",
        "name": "تحدي الفرق",
        "description": "انضم لفريق بنفسجي أو ناري واجمع النقاط لفريقك.",
        "rules": "اختر فريقك، ثم تُلعب ثلاث جولات تُحسب على الخادم. مجموع نقاطك يضاف لرصيد فريقك.",
        "duration_seconds": 90,
        "sort_order": 6,
    },
]

QUIZ_BANK: list[dict] = [
    {
        "prompt": "ما عاصمة العراق؟",
        "options": ["بغداد", "البصرة", "أربيل", "الموصل"],
        "correct": 0,
    },
    {
        "prompt": "كم عدد أيام السنة الميلادية غير الكبيسة؟",
        "options": ["365", "360", "366", "364"],
        "correct": 0,
    },
    {
        "prompt": "ما أكبر كوكب في المجموعة الشمسية؟",
        "options": ["المشتري", "زحل", "الأرض", "نبتون"],
        "correct": 0,
    },
    {
        "prompt": "ما اللون الناتج عن خلط الأزرق والأصفر؟",
        "options": ["الأخضر", "البرتقالي", "البنفسجي", "الأحمر"],
        "correct": 0,
    },
    {
        "prompt": "كم عدد لاعبي فريق كرة القدم داخل الملعب؟",
        "options": ["11", "10", "12", "9"],
        "correct": 0,
    },
    {
        "prompt": "ما أطول نهر في العالم؟",
        "options": ["النيل", "دجلة", "الفرات", "الأمازون"],
        "correct": 0,
    },
    {
        "prompt": "في أي قارة تقع مصر؟",
        "options": ["أفريقيا", "آسيا", "أوروبا", "أستراليا"],
        "correct": 0,
    },
    {
        "prompt": "ما وحدة قياس شدة التيار الكهربائي؟",
        "options": ["الأمبير", "الفولت", "الواط", "الأوم"],
        "correct": 0,
    },
    {
        "prompt": "كم عدد أضلاع المثلث؟",
        "options": ["3", "4", "5", "6"],
        "correct": 0,
    },
    {
        "prompt": "ما أسرع حيوان بري في العالم؟",
        "options": ["الفهد", "الأسد", "الحصان", "الغزال"],
        "correct": 0,
    },
    {
        "prompt": "ما العنصر الكيميائي الذي رمزه O؟",
        "options": ["الأكسجين", "الذهب", "الحديد", "الفضة"],
        "correct": 0,
    },
    {
        "prompt": "كم عدد أشهر السنة الهجرية؟",
        "options": ["12", "11", "13", "10"],
        "correct": 0,
    },
    {
        "prompt": "ما اسم أكبر محيط في العالم؟",
        "options": ["الهادي", "الأطلسي", "الهندي", "المتجمد الشمالي"],
        "correct": 0,
    },
    {
        "prompt": "ما ناتج 7 × 8؟",
        "options": ["56", "54", "64", "48"],
        "correct": 0,
    },
    {
        "prompt": "ما عاصمة الإمارات العربية المتحدة؟",
        "options": ["أبوظبي", "دبي", "الشارقة", "العين"],
        "correct": 0,
    },
]

WHEEL_SEGMENTS = [
    {"label": "100 نقطة", "points": 100, "weight": 38},
    {"label": "250 نقطة", "points": 250, "weight": 26},
    {"label": "500 نقطة", "points": 500, "weight": 18},
    {"label": "1000 نقطة", "points": 1000, "weight": 10},
    {"label": "2000 نقطة", "points": 2000, "weight": 6},
    {"label": "الجائزة الكبرى", "points": 5000, "weight": 2},
]


def parse_dt(value: str | None) -> datetime | None:
    """يقرأ ISO من الواجهة أو قاعدة البيانات ويحوّله إلى UTC."""

    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds")


def event_phase(status: str, starts_at: str, ends_at: str) -> str:
    now = datetime.now(timezone.utc)
    start = parse_dt(starts_at)
    end = parse_dt(ends_at)
    if status == "draft":
        return "draft"
    if status == "paused":
        return "paused"
    if status == "ended" or (end is not None and now >= end):
        return "ended"
    if start is not None and now < start:
        return "upcoming"
    if end is not None and end - now <= timedelta(minutes=30):
        return "ending"
    return "active"


def can_join(status: str, starts_at: str, ends_at: str) -> bool:
    return status == "active" and event_phase(status, starts_at, ends_at) in {
        "active",
        "ending",
    }


def pick_questions(count: int) -> list[dict]:
    """يختار أسئلة ويخلط خياراتها، فلا يمكن تخمين الإجابة من ترتيبها."""

    pool = list(QUIZ_BANK)
    rng = secrets.SystemRandom()
    rng.shuffle(pool)
    total = max(1, min(count, len(pool)))
    selected: list[dict] = []
    for item in pool[:total]:
        options = list(item["options"])
        correct_text = options[int(item["correct"])]
        rng.shuffle(options)
        selected.append(
            {
                "prompt": item["prompt"],
                "options": options,
                "correct": options.index(correct_text),
            }
        )
    return selected


def public_questions(questions: list[dict]) -> list[dict]:
    return [
        {"prompt": item["prompt"], "options": list(item["options"])}
        for item in questions
    ]


def _weighted_pick(segments: list[dict]) -> dict:
    total = sum(int(segment["weight"]) for segment in segments)
    roll = secrets.randbelow(max(1, total))
    cursor = 0
    for segment in segments:
        cursor += int(segment["weight"])
        if roll < cursor:
            return segment
    return segments[-1]


def resolve_game(game_key: str, team: str | None = None) -> dict:
    """ينفّذ جولة كاملة على الخادم ويعيد النقاط وتفاصيل العرض."""

    if game_key == "lucky_challenge":
        die = secrets.randbelow(6) + 1
        bonus = secrets.choice([0, 10, 20, 50, 100])
        score = die * 100 + bonus
        return {
            "score": score,
            "detail": {
                "game": game_key,
                "dice": die,
                "bonus": bonus,
                "headline": f"رميت النرد فحصلت على {die} ومكافأة {bonus} نقطة",
            },
        }

    if game_key == "prize_wheel":
        segment = _weighted_pick(WHEEL_SEGMENTS)
        return {
            "score": int(segment["points"]),
            "detail": {
                "game": game_key,
                "segment": segment["label"],
                "headline": f"توقفت العجلة على: {segment['label']}",
            },
        }

    if game_key == "mystery_box":
        box = secrets.randbelow(3) + 1
        points = secrets.choice([150, 300, 600, 900, 1500])
        return {
            "score": points,
            "detail": {
                "game": game_key,
                "box": box,
                "headline": f"فتحت الصندوق رقم {box} ووجدت {points} نقطة",
            },
        }

    if game_key == "points_challenge":
        rounds = [secrets.randbelow(101) + 50 for _ in range(5)]
        return {
            "score": sum(rounds),
            "detail": {
                "game": game_key,
                "rounds": rounds,
                "headline": f"جمعت {sum(rounds)} نقطة في خمس جولات",
            },
        }

    if game_key == "group_game":
        chosen = team if team in {"violet", "fire"} else "violet"
        rounds = [secrets.randbelow(151) + 50 for _ in range(3)]
        return {
            "score": sum(rounds),
            "detail": {
                "game": game_key,
                "team": chosen,
                "rounds": rounds,
                "headline": f"أضفت {sum(rounds)} نقطة لفريق {'بنفسجي' if chosen == 'violet' else 'ناري'}",
            },
        }

    return {
        "score": 0,
        "detail": {"game": game_key, "headline": "لم تُحسب الجولة"},
    }


def grade_quiz(questions: list[dict], answers: list[int], elapsed_seconds: int) -> dict:
    """يقيّم إجابات العميل مقابل مفتاح محفوظ على الخادم فقط."""

    correct = 0
    marks: list[bool] = []
    for index, question in enumerate(questions):
        chosen = answers[index] if index < len(answers) else -1
        is_correct = chosen == int(question["correct"])
        marks.append(is_correct)
        if is_correct:
            correct += 1
    bonus = max(0, 300 - max(0, int(elapsed_seconds)))
    score = correct * 100 + bonus
    return {
        "score": score,
        "detail": {
            "game": "quiz",
            "correct": correct,
            "total": len(questions),
            "marks": marks,
            "speed_bonus": bonus,
            "answers": [int(item["correct"]) for item in questions],
            "headline": f"أجبت بشكل صحيح على {correct} من {len(questions)} — {score} نقطة",
        },
    }
