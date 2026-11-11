"""Systems catalogue API coverage: 1000 systems across 40 specialties."""

import pytest

TOTAL = 1000
SPECIALTIES = 40
PER_SPECIALTY = TOTAL // SPECIALTIES
STATUSES = ["يعمل", "تجريبي", "صيانة", "متوقف"]


def get_page(client, **params):
    response = client.get("/api/systems", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_catalogue_meta_total(client):
    meta = client.get("/api/systems/meta").json()
    assert meta["total"] == TOTAL


def test_catalogue_meta_specialties(client):
    meta = client.get("/api/systems/meta").json()
    assert meta["specialties_total"] == SPECIALTIES
    assert len(meta["specialties"]) == SPECIALTIES
    assert sum(item["count"] for item in meta["specialties"]) == TOTAL


def test_catalogue_meta_statuses(client):
    meta = client.get("/api/systems/meta").json()
    assert {item["name"] for item in meta["statuses"]} == set(STATUSES)
    assert sum(item["count"] for item in meta["statuses"]) == TOTAL


def test_catalogue_meta_summary_fields(client):
    meta = client.get("/api/systems/meta").json()
    assert meta["users_total"] > 0
    assert 0 < meta["uptime_avg"] <= 100


def test_default_page_shape(client):
    page = get_page(client)
    assert page["total"] == TOTAL
    assert page["page"] == 1
    assert page["page_size"] == 20
    assert page["pages"] == 50
    assert len(page["items"]) == 20


def test_second_page_differs_from_first(client):
    first = get_page(client)["items"]
    second = get_page(client, page=2)["items"]
    assert {row["code"] for row in first}.isdisjoint({row["code"] for row in second})


def test_page_out_of_range_is_empty(client):
    page = get_page(client, page=999)
    assert page["items"] == []
    assert page["total"] == TOTAL


@pytest.mark.parametrize("page_size", [1, 5, 50, 100])
def test_page_size_is_respected(client, page_size):
    page = get_page(client, page_size=page_size)
    assert len(page["items"]) == page_size
    assert page["pages"] == -(-TOTAL // page_size)


@pytest.mark.parametrize("page_size", [0, 101, 500])
def test_page_size_out_of_bounds_is_rejected(client, page_size):
    assert client.get("/api/systems", params={"page_size": page_size}).status_code == 422


@pytest.mark.parametrize("page", [0, -3])
def test_page_out_of_bounds_is_rejected(client, page):
    assert client.get("/api/systems", params={"page": page}).status_code == 422


@pytest.mark.parametrize(
    "specialty",
    ["الرعاية الصحية", "المصارف", "البيئة", "السجل المدني والهوية"],
)
def test_specialty_filter(client, specialty):
    page = get_page(client, specialty=specialty, page_size=100)
    assert page["total"] == PER_SPECIALTY
    assert all(row["specialty"] == specialty for row in page["items"])


@pytest.mark.parametrize("status", STATUSES)
def test_status_filter(client, status):
    page = get_page(client, status=status, page_size=100)
    assert page["total"] > 0
    assert all(row["status"] == status for row in page["items"])


def test_specialty_and_status_combined(client):
    specialty = "الكهرباء"
    status = "يعمل"
    page = get_page(client, specialty=specialty, status=status, page_size=100)
    assert all(
        row["specialty"] == specialty and row["status"] == status for row in page["items"]
    )


def test_search_by_code_is_case_insensitive(client):
    page = get_page(client, q="sys-0001")
    assert page["total"] >= 1
    assert page["items"][0]["code"] == "SYS-0001"


@pytest.mark.parametrize(
    "term",
    ["الرافدين", "دجلة", "بغداد", "سجلات المرضى", "المصارف"],
)
def test_search_matches_catalogue_fields(client, term):
    page = get_page(client, q=term, page_size=100)
    assert page["total"] > 0
    needle = term
    for row in page["items"]:
        haystack = " ".join(
            [row["name"], row["specialty"], row["vendor"], row["governorate"], row["code"]]
        )
        assert needle in haystack


@pytest.mark.parametrize("term", ["لا يوجد نظام بهذا الاسم", "zzzz-000", "؟؟؟"])
def test_search_without_matches(client, term):
    page = get_page(client, q=term)
    assert page["total"] == 0
    assert page["items"] == []


SYSTEM_FIELDS = [
    "id",
    "code",
    "name",
    "specialty",
    "vendor",
    "governorate",
    "status",
    "version",
    "users",
    "uptime",
    "description",
    "created_at",
]


@pytest.mark.parametrize("field", SYSTEM_FIELDS)
def test_system_detail_shape(client, field):
    first = get_page(client)["items"][0]
    detail = client.get(f"/api/systems/{first['id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert field in body
    assert body[field] == first[field]


def test_missing_system_returns_404(client):
    assert client.get("/api/systems/999999").status_code == 404


def test_every_system_is_unique_and_specialised(client):
    rows = []
    for page in range(1, 11):
        rows.extend(get_page(client, page=page, page_size=100)["items"])
    assert len(rows) == TOTAL
    assert len({row["code"] for row in rows}) == TOTAL
    assert all(row["specialty"] for row in rows)
    assert all(row["vendor"] for row in rows)
    assert all(row["description"] for row in rows)


def test_uptime_matches_status(client):
    rows = []
    for page in range(1, 3):
        rows.extend(get_page(client, page=page, page_size=100)["items"])
    for row in rows:
        if row["status"] == "متوقف":
            assert row["uptime"] == 0.0
        else:
            assert 90 <= row["uptime"] <= 100
