"""Pagination and server-side search.

The point of these is the scale guarantee: a list endpoint must never return
the whole table, filtering must happen in SQL rather than over one page, and
the totals must describe everything rather than what is on screen.
"""
import pytest

from app.pagination import MAX_PAGE_SIZE


def make_orders(make_order, count: int, **kwargs):
    return [make_order(2, **kwargs) for _ in range(count)]


# --------------------------------------------------------------------------- #
# The envelope
# --------------------------------------------------------------------------- #
def test_a_list_returns_a_page_not_the_whole_table(client, auth, world, make_order):
    make_orders(make_order, 12)

    body = client.get("/api/orders?page_size=5", headers=auth).json()
    assert len(body["items"]) == 5
    assert body["total"] == 12
    assert body["page"] == 1
    assert body["page_size"] == 5
    assert body["pages"] == 3
    assert body["has_next"] is True
    assert body["has_previous"] is False


def test_paging_walks_every_row_exactly_once(client, auth, world, make_order):
    make_orders(make_order, 12)

    seen = []
    for page in (1, 2, 3):
        body = client.get(f"/api/orders?page={page}&page_size=5", headers=auth).json()
        seen.extend(o["id"] for o in body["items"])

    assert len(seen) == 12
    assert len(set(seen)) == 12, "a row appeared on two pages"


def test_the_last_page_reports_itself(client, auth, world, make_order):
    make_orders(make_order, 12)
    body = client.get("/api/orders?page=3&page_size=5", headers=auth).json()
    assert len(body["items"]) == 2
    assert body["has_next"] is False
    assert body["has_previous"] is True


def test_a_page_past_the_end_is_empty_not_an_error(client, auth, world, make_order):
    make_orders(make_order, 3)
    body = client.get("/api/orders?page=99&page_size=5", headers=auth).json()
    assert body["items"] == []
    assert body["total"] == 3


def test_page_size_is_capped(client, auth):
    """A caller must not be able to ask for the whole table."""
    assert client.get("/api/orders?page_size=100000", headers=auth).status_code == 422
    assert (
        client.get(f"/api/orders?page_size={MAX_PAGE_SIZE}", headers=auth).status_code
        == 200
    )
    assert client.get("/api/orders?page=0", headers=auth).status_code == 422


def test_an_empty_table_is_a_well_formed_page(client, auth):
    body = client.get("/api/orders", headers=auth).json()
    assert body == {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 25,
        "pages": 0,
        "has_next": False,
        "has_previous": False,
    }


# --------------------------------------------------------------------------- #
# Search and filter run in SQL, not over one page
# --------------------------------------------------------------------------- #
def test_search_reaches_rows_beyond_the_first_page(client, auth, world, make_order):
    """The needle is deliberately last, so a client-side filter would miss it."""
    make_orders(make_order, 30)
    needle = make_order(9)
    client.patch(
        f"/api/orders/{needle.id}", headers=auth, json={"material": "Unobtainium"}
    )

    body = client.get("/api/orders?search=Unobtainium&page_size=5", headers=auth).json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == needle.id


def test_a_status_filter_counts_the_whole_table(client, auth, world, make_order):
    make_orders(make_order, 8)
    assigned = make_order(4)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [assigned.id]},
    )

    body = client.get("/api/orders?status=assigned&page_size=2", headers=auth).json()
    assert body["total"] == 1
    assert [o["id"] for o in body["items"]] == [assigned.id]


def test_sorting_is_applied_before_the_page(client, auth, world, make_order):
    light = make_order(1)
    heavy = make_order(19)
    make_orders(make_order, 5)

    top = client.get(
        "/api/orders?sort=quantity_tons&descending=true&page_size=1", headers=auth
    ).json()
    assert top["items"][0]["id"] == heavy.id

    bottom = client.get(
        "/api/orders?sort=quantity_tons&page_size=1", headers=auth
    ).json()
    assert bottom["items"][0]["id"] == light.id


# --------------------------------------------------------------------------- #
# Capacity filters have to be SQL, or paging silently drops rows
# --------------------------------------------------------------------------- #
def test_trucks_with_free_space_is_filtered_in_sql(client, auth, db, world, make_order):
    from app.models import Truck

    # A second truck, filled to the brim.
    full = Truck(registration_number="GJ01AB7777", capacity_tons=10)
    db.add(full)
    db.commit()

    body = client.get("/api/trucks?has_available_capacity=true", headers=auth).json()
    regs = {t["registration_number"] for t in body["items"]}
    assert regs == {"GJ01AB1234", "GJ01AB7777"}
    assert body["total"] == 2

    # Load the 20T truck to capacity; it should drop out of the filter.
    order = make_order(20)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )
    body = client.get("/api/trucks?has_available_capacity=true", headers=auth).json()
    regs = {t["registration_number"] for t in body["items"]}
    assert regs == {"GJ01AB7777"}
    assert body["total"] == 1


def test_trucks_without_a_driver_is_filtered_in_sql(client, auth, db, world):
    from app.models import Truck

    db.add(Truck(registration_number="GJ01AB7777", capacity_tons=10))
    db.commit()

    body = client.get("/api/trucks?without_driver=true", headers=auth).json()
    assert body["total"] == 1
    assert body["items"][0]["registration_number"] == "GJ01AB7777"


def test_drivers_without_a_truck_is_filtered_in_sql(client, auth, db, world):
    from app.models import Driver

    db.add(
        Driver(
            code="DRV-0002",
            name="Spare Driver",
            phone="+91 9000000002",
            license_number="GJ02-2021-7654321",
        )
    )
    db.commit()

    body = client.get("/api/drivers?unassigned=true", headers=auth).json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Spare Driver"


# --------------------------------------------------------------------------- #
# Every list is paged
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "path",
    [
        "/api/orders",
        "/api/orders/places",
        "/api/trucks",
        "/api/drivers",
        "/api/trips",
        "/api/alerts",
    ],
)
def test_every_staff_list_is_paged(client, auth, path):
    body = client.get(path, headers=auth).json()
    assert set(body) >= {"items", "total", "page", "page_size", "pages"}, path


def test_the_assignment_board_pages_both_sides(client, auth, world, make_order):
    make_orders(make_order, 9)

    body = client.get(
        "/api/assignment/board?page_size=4&truck_page_size=1", headers=auth
    ).json()

    assert len(body["unassigned_orders"]["items"]) == 4
    assert body["unassigned_orders"]["total"] == 9
    assert len(body["trucks"]["items"]) == 1

    # Totals describe the whole backlog, not the page.
    assert body["totals"]["unassigned_count"] == 9
    assert body["totals"]["unassigned_tons"] == 18.0


def test_the_board_search_reaches_beyond_the_page(client, auth, world, make_order):
    make_orders(make_order, 20)
    needle = make_order(3)
    client.patch(
        f"/api/orders/{needle.id}", headers=auth, json={"material": "Unobtainium"}
    )

    body = client.get(
        "/api/assignment/board?order_search=Unobtainium&page_size=5", headers=auth
    ).json()
    assert body["unassigned_orders"]["total"] == 1
    assert body["unassigned_orders"]["items"][0]["id"] == needle.id


def test_the_alert_badge_count_is_its_own_endpoint(client, auth, db, world, make_order):
    """The nav badge must not pull a page of rows to show a number."""
    from app.services import alerts as alert_service

    make_order(5, days_ahead=-3)
    alert_service.scan(db)

    listed = client.get("/api/alerts", headers=auth).json()
    count = client.get("/api/alerts/open-count", headers=auth).json()
    assert count == listed["total"]
    assert count > 0


# --------------------------------------------------------------------------- #
# The customer-facing lists too
# --------------------------------------------------------------------------- #
def test_portal_orders_and_places_are_paged(client, world):
    from tests.test_portal import add_company, place, sign_in

    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    for _ in range(7):
        place(client, headers, company["id"])

    orders = client.get("/api/portal/orders?page_size=3", headers=headers).json()
    assert len(orders["items"]) == 3
    assert orders["total"] == 7

    book = client.get("/api/portal/places", headers=headers).json()
    assert set(book) >= {"items", "total", "page"}


def test_portal_orders_filter_by_stage_in_sql(client, auth, world):
    from tests.test_portal import add_company, place, sign_in

    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    waiting = [place(client, headers, company["id"]) for _ in range(4)]
    booked = place(client, headers, company["id"])

    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [booked["id"]]},
    )

    placed = client.get(
        "/api/portal/orders?stage=placed&page_size=2", headers=headers
    ).json()
    assert placed["total"] == len(waiting)

    scheduled = client.get("/api/portal/orders?stage=scheduled", headers=headers).json()
    assert scheduled["total"] == 1
    assert scheduled["items"][0]["code"] == booked["code"]

    assert (
        client.get("/api/portal/orders?stage=nonsense", headers=headers).status_code
        == 422
    )


def test_the_portal_summary_counts_in_sql(client, auth, world):
    """The figures must not depend on loading every order."""
    from tests.test_portal import add_company, place, sign_in

    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    for _ in range(6):
        place(client, headers, company["id"])

    summary = client.get("/api/portal/summary", headers=headers).json()
    assert summary["total"] == 6
    assert summary["awaiting_truck"] == 6
    assert summary["companies"] == 1


def test_driver_trip_history_is_paged(client, auth, world, make_order):
    from tests.test_driver_app import driver_sign_in

    headers = driver_sign_in(client, "9900000000")
    body = client.get("/api/driver/trips", headers=headers).json()
    assert set(body) >= {"items", "total", "page"}


# --------------------------------------------------------------------------- #
# Table-wide counts
#
# Every filter chip and headline figure now reads from a `/stats` endpoint
# rather than tallying the rows on screen. These tests exist to catch the
# regression that matters: a count that silently becomes per-page.
# --------------------------------------------------------------------------- #
def test_driver_stats_count_the_whole_table_not_one_page(client, auth, db, world):
    """Twelve drivers, a page of two, and the chips must still say twelve."""
    from app.models import Driver

    for n in range(11):
        db.add(
            Driver(
                code=f"DRV-9{n:03d}",
                name=f"Spare Driver {n}",
                phone=f"+91 90000000{n:02d}",
                license_number=f"GJ09-2021-00000{n:02d}",
            )
        )
    db.commit()

    page = client.get("/api/drivers?page_size=2", headers=auth).json()
    assert len(page["items"]) == 2

    stats = client.get("/api/drivers/stats", headers=auth).json()
    assert stats["total"] == 12  # the world's driver plus eleven
    assert sum(stats["by_status"].values()) == 12
    # Only the world's driver holds a truck.
    assert stats["without_truck"] == 11


def test_order_stats_ignore_the_status_filter_but_honour_search(
    client, auth, world, make_order
):
    """A chip has to show what selecting it would find, so status is excluded."""
    make_order(5.0)
    make_order(3.0)
    assigned = make_order(2.0)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [assigned.id]},
    )

    stats = client.get("/api/orders/stats", headers=auth).json()
    assert stats["total"] == 3
    assert stats["by_status"]["unassigned"] == 2
    assert stats["by_status"]["assigned"] == 1
    assert stats["total_tons"] == pytest.approx(10.0)
    assert stats["tons_by_status"]["unassigned"] == pytest.approx(8.0)

    # A status filter on the list does not shrink the chip counts...
    filtered = client.get("/api/orders/stats?search=Steel", headers=auth).json()
    assert filtered["total"] == 3
    # ...but a search does, because it bounds what the user is looking at.
    narrow = client.get("/api/orders/stats?search=NOTHINGMATCHES", headers=auth).json()
    assert narrow["total"] == 0
    assert narrow["total_tons"] == 0


def test_trip_stats_count_every_trip_and_the_cargo_on_the_road(
    client, auth, world, make_order
):
    order = make_order(6.0)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )

    stats = client.get("/api/trips/stats", headers=auth).json()
    assert stats["total"] == 1
    assert sum(stats["by_status"].values()) == 1
    # Planned, not yet rolling, so nothing is on the road.
    assert stats["active_cargo_tons"] == 0

    trips = client.get("/api/trips", headers=auth).json()
    trip_id = trips["items"][0]["id"]
    client.post(f"/api/trips/{trip_id}/start", headers=auth)

    rolling = client.get("/api/trips/stats", headers=auth).json()
    assert rolling["by_status"]["in_progress"] == 1
    assert rolling["active_cargo_tons"] == pytest.approx(6.0)


def test_driver_history_stats_cover_the_whole_record(client, auth, world, make_order):
    """The driver's headline is their career, not the page of history on screen."""
    from tests.test_driver_app import driver_sign_in

    headers = driver_sign_in(client, "9900000000")
    stats = client.get("/api/driver/trips/stats", headers=headers).json()
    assert stats == {"total": 0, "completed": 0, "completed_cargo_tons": 0.0}

    order = make_order(7.0)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )

    after = client.get("/api/driver/trips/stats", headers=headers).json()
    assert after["total"] == 1
    # Nothing finished yet, so the carried figure stays at zero.
    assert after["completed"] == 0


def test_stats_routes_are_not_swallowed_by_the_id_routes(client, auth):
    """`/stats` must be declared before `/{id}`, or it parses as an id."""
    for path in (
        "/api/drivers/stats",
        "/api/orders/stats",
        "/api/trips/stats",
    ):
        assert client.get(path, headers=auth).status_code == 200, path


def test_the_board_sorts_the_backlog_by_pickup_place(client, auth, world, make_order):
    """The third sort option the screen offers has to exist on the server."""
    make_order(2.0, pickup=world["surat"])
    make_order(2.0, pickup=world["ahmedabad"])

    body = client.get(
        "/api/assignment/board?order_sort=pickup_name", headers=auth
    ).json()
    names = [o["pickup_name"] for o in body["unassigned_orders"]["items"]]
    assert names == sorted(names)

    assert (
        client.get("/api/assignment/board?order_sort=nonsense", headers=auth).status_code
        == 422
    )
