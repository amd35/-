"""مكتبة خلفيات الغرف الصوتية: 20 صورة فوتوغرافية حقيقية برخصة حرة.

الصور ملفات فعلية في `web/public/img/rooms` (نسخة كاملة) و`web/public/img/rooms/thumbs`
(نسخة مصغّرة للمعاينة)، ومصادرها وتراخيصها موثّقة في `web/public/img/rooms/CREDITS.md`.

التدرّجات الست القديمة (`sunset`, `night`, `desert`, `sea`, `royal`, `aurora`) تبقى صالحة
ومتاحة في المنتقي، فلا تفقد أي غرفة خلفيتها القديمة عند إضافة المكتبة الفوتوغرافية.
"""
from typing import Any, Optional

PHOTO_DIR = "/img/rooms"
THUMB_DIR = "/img/rooms/thumbs"

# (المعرّف، الاسم بالعربية، الاسم بالإنجليزية) — الترتيب هو ترتيب العرض في المنتقي.
_PHOTOS: list[tuple[str, str, str]] = [
    ("luxury-suite", "غرفة فاخرة", "Luxury room"),
    ("romantic-sea", "رومانسية بحرية", "Romantic seaside"),
    ("starry-night", "سماء ونجوم", "Starry night"),
    ("red-roses", "ورد أحمر", "Red roses"),
    ("luxury-cars", "سيارات فاخرة", "Luxury cars"),
    ("waterfall-nature", "شلال وطبيعة", "Waterfall & nature"),
    ("romantic-bedroom", "غرفة نوم رومانسية", "Romantic bedroom"),
    ("anime-romance", "أنمي رومانسي", "Anime romance"),
    ("royal-throne", "عرش ملكي", "Royal throne"),
    ("sunflowers", "زهور الشمس", "Sunflowers"),
    ("teddy-romance", "ديدوب رومانسي", "Teddy romance"),
    ("future-city", "مدينة المستقبل", "Future city"),
    ("calm-lounge", "جلسة هادئة", "Calm lounge"),
    ("cherry-blossom", "أزهار الكرز", "Cherry blossom"),
    ("campfire", "نار المخيم", "Campfire"),
    ("white-car", "سيارة بيضاء", "White sports car"),
    ("purple-night", "ليل ساحر", "Enchanted night"),
    ("coffee-calm", "قهوة وهدوء", "Coffee & calm"),
    ("fantasy-castle", "قلعة خيالية", "Fantasy castle"),
    ("red-car", "سيارة حمراء", "Red sports car"),
]

# تدرّجات الثيمات القديمة (bg-* في styles.css) — محفوظة كما هي.
_THEMES: list[tuple[str, str, str]] = [
    ("sunset", "غروب", "Sunset"),
    ("night", "ليل", "Night"),
    ("desert", "صحراء", "Desert"),
    ("sea", "بحر", "Sea"),
    ("royal", "ملكي", "Royal"),
    ("aurora", "شفق", "Aurora"),
]

BACKGROUND_LIBRARY: list[dict[str, Any]] = [
    {
        "slug": slug,
        "name_ar": name_ar,
        "name_en": name_en,
        "kind": "photo",
        "url": f"{PHOTO_DIR}/{slug}.jpg",
        "thumb_url": f"{THUMB_DIR}/{slug}.jpg",
    }
    for slug, name_ar, name_en in _PHOTOS
] + [
    {
        "slug": slug,
        "name_ar": name_ar,
        "name_en": name_en,
        "kind": "theme",
        "url": None,
        "thumb_url": None,
    }
    for slug, name_ar, name_en in _THEMES
]

DEFAULT_BACKGROUND = _PHOTOS[0][0]

# الصورة الفوتوغرافية التي تمثّل كل ثيم متدرّج قديم في الواجهة (الصفحة الرئيسية
# تعرض صورة حقيقية لكل غرفة، ولا تُترك شريحة بلا صورة).
THEME_PHOTOS: dict[str, str] = {
    "sunset": "romantic-sea",
    "night": "starry-night",
    "desert": "campfire",
    "sea": "romantic-sea",
    "royal": "royal-throne",
    "aurora": "starry-night",
}

_BY_SLUG: dict[str, dict[str, Any]] = {entry["slug"]: entry for entry in BACKGROUND_LIBRARY}

BACKGROUND_SLUGS: tuple[str, ...] = tuple(_BY_SLUG)


def library() -> list[dict[str, Any]]:
    """المكتبة كاملة (صور + ثيمات) بترتيب العرض."""
    return [dict(entry) for entry in BACKGROUND_LIBRARY]


def is_available(slug: Optional[str]) -> bool:
    return bool(slug) and slug in _BY_SLUG


def resolve(slug: Optional[str]) -> dict[str, Any]:
    """مدخل الخلفية المحفوظة في الغرفة، والخلفية الافتراضية عند قيمة غير معروفة."""
    return _BY_SLUG.get(slug or "", _BY_SLUG[DEFAULT_BACKGROUND])


def photo_slug(slug: Optional[str]) -> str:
    """معرّف الصورة الفوتوغرافية التي تمثّل الخلفية: صورتها، أو صورة ثيمها المتدرّج."""
    entry = resolve(slug)
    if entry["kind"] == "photo":
        return entry["slug"]
    return THEME_PHOTOS.get(entry["slug"], DEFAULT_BACKGROUND)


def photo_url(slug: Optional[str]) -> str:
    """رابط الصورة الفوتوغرافية الممثّلة للخلفية (يصلح لواجهة تعرض صورة دائماً)."""
    return f"{PHOTO_DIR}/{photo_slug(slug)}.jpg"


def public(slug: Optional[str]) -> dict[str, Any]:
    """حقول الخلفية التي تُرسل مع الغرفة: النوع والصورة والاسم."""
    entry = resolve(slug)
    return {
        "background": entry["slug"],
        "background_kind": entry["kind"],
        "background_url": entry["url"],
        # صورة فوتوغرافية دائماً: صورة الغرفة، أو صورة تمثّل ثيمها المتدرّج القديم.
        "background_photo_url": photo_url(entry["slug"]),
        "background_thumb_url": entry["thumb_url"],
        "background_name_ar": entry["name_ar"],
        "background_name_en": entry["name_en"],
    }
