"""End-to-end API behaviour for the assignment and trip workflow."""


def test_health_is_public(client):
    response = client.get("/api/system/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_endpoints_require_authentication(client):
    assert client.get("/api/trucks").status_code == 401
    assert client.get("/api/dashboard").status_code == 401


def test_login_rejects_bad_credentials(client, db, admin_token):
    assert admin_token  # fixture created the user
    response = client.post(
        "/api/auth/login", json={"email": "t@example.com", "password": "wrong"}
    )
    assert response.status_code == 401


def test_preview_reports_capacity_without_mutating(client, auth, world, make_order):
    order = make_order(25)  # exceeds the 20T truck
    response = client.post(
        "/api/assignment/preview",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is False
    assert body["overflow_tons"] == 5.0
    assert "Over capacity" in body["reason"]

    # Nothing was written.
    assert client.get(f"/api/orders/{order.id}", headers=auth).json()["truck_id"] is None


def test_assign_creates_a_trip_with_an_optimised_route(client, auth, world, make_order):
    a = make_order(8, world["ahmedabad"], world["vadodara"])
    b = make_order(7, world["ahmedabad"], world["surat"])

    response = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [a.id, b.id], "create_trip": True},
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["capacity"]["current_load_tons"] == 15.0
    assert body["capacity"]["available_tons"] == 5.0
    assert body["trip"] is not None

    trip = body["trip"]
    assert trip["total_cargo_tons"] == 15.0
    assert trip["stop_count"] == len(trip["stops"])
    # Both pickups share Ahmedabad, so they collapse into a single stop.
    pickups = [s for s in trip["stops"] if s["stop_type"] == "pickup"]
    assert len(pickups) == 1
    assert len(pickups[0]["orders"]) == 2


def test_assign_over_capacity_returns_422_with_detail(client, auth, world, make_order):
    a = make_order(18)
    b = make_order(6)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [a.id]},
    )

    response = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [b.id]},
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["error"] == "capacity_exceeded"
    assert detail["overflow_tons"] == 4.0


def test_full_trip_lifecycle(client, auth, world, make_order):
    order = make_order(12)
    assign = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    ).json()
    trip_id = assign["trip"]["id"]

    started = client.post(f"/api/trips/{trip_id}/start", headers=auth).json()
    assert started["status"] == "in_progress"

    stops = started["stops"]
    assert len(stops) == 2

    # Completing out of order is refused.
    out_of_order = client.post(
        f"/api/trips/{trip_id}/stops/{stops[1]['id']}/complete", headers=auth
    )
    assert out_of_order.status_code == 422

    after_pickup = client.post(
        f"/api/trips/{trip_id}/stops/{stops[0]['id']}/complete", headers=auth
    ).json()
    assert after_pickup["orders"][0]["status"] == "in_transit"

    after_delivery = client.post(
        f"/api/trips/{trip_id}/stops/{stops[1]['id']}/complete", headers=auth
    ).json()
    assert after_delivery["status"] == "completed"
    assert after_delivery["progress_percent"] == 100.0

    # The truck is free again and the load has been released.
    truck = client.get(f"/api/trucks/{world['truck'].id}", headers=auth).json()
    assert truck["status"] == "available"
    assert truck["capacity"]["current_load_tons"] == 0.0
    assert truck["current_trip_id"] is None


def test_unassign_returns_the_order_to_the_backlog(client, auth, world, make_order):
    order = make_order(9)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )

    response = client.post(f"/api/assignment/unassign/{order.id}", headers=auth)
    assert response.status_code == 200
    assert response.json()["capacity"]["current_load_tons"] == 0.0

    refreshed = client.get(f"/api/orders/{order.id}", headers=auth).json()
    assert refreshed["status"] == "unassigned"
    assert refreshed["truck_id"] is None


def test_a_driver_cannot_hold_two_trucks(client, auth, db, world):
    second = client.post(
        "/api/trucks",
        headers=auth,
        json={"registration_number": "GJ01AB9999", "capacity_tons": 15},
    )
    assert second.status_code == 201

    response = client.post(
        f"/api/drivers/{world['driver'].id}/assign-truck/{second.json()['id']}",
        headers=auth,
    )
    assert response.status_code == 200
    # The original truck must have been released, not duplicated.
    original = client.get(f"/api/trucks/{world['truck'].id}", headers=auth).json()
    assert original["driver"] is None


def test_capacity_cannot_drop_below_current_load(client, auth, world, make_order):
    order = make_order(16)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )
    response = client.patch(
        f"/api/trucks/{world['truck'].id}", headers=auth, json={"capacity_tons": 10}
    )
    assert response.status_code == 422
    assert "already carrying" in response.json()["detail"]


def test_trip_requires_a_driver(client, auth, world, make_order):
    truck = client.post(
        "/api/trucks",
        headers=auth,
        json={"registration_number": "GJ01AB8888", "capacity_tons": 25},
    ).json()
    order = make_order(10)

    response = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": truck["id"], "order_ids": [order.id]},
    )
    assert response.status_code == 422
    assert "no driver" in response.json()["detail"]["message"]


def test_global_search_finds_a_truck_by_registration(client, auth, world):
    response = client.get("/api/search?q=GJ01AB1234", headers=auth)
    assert response.status_code == 200
    hits = response.json()["hits"]
    assert any(h["kind"] == "truck" and h["label"] == "GJ01AB1234" for h in hits)


def test_dashboard_counts_reflect_the_fleet(client, auth, world):
    body = client.get("/api/dashboard", headers=auth).json()
    assert body["fleet"]["total_trucks"] == 1
    assert body["fleet"]["available"] == 1
    assert body["fleet"]["total_capacity_tons"] == 20.0


def test_operator_can_set_a_manual_truck_status(client, auth, world):
    truck_id = world["truck"].id
    response = client.post(f"/api/trucks/{truck_id}/status?status=maintenance", headers=auth)
    assert response.status_code == 200
    assert response.json()["status"] == "maintenance"


def test_lifecycle_statuses_are_not_operator_settable(client, auth, world):
    """in_transit and assigned are owned by the trip, not the operator."""
    truck_id = world["truck"].id
    response = client.post(f"/api/trucks/{truck_id}/status?status=in_transit", headers=auth)
    assert response.status_code == 422


def test_a_truck_on_an_active_trip_cannot_be_marked_available(
    client, auth, world, make_order
):
    order = make_order(10)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )
    response = client.post(
        f"/api/trucks/{world['truck'].id}/status?status=available", headers=auth
    )
    assert response.status_code == 422
    assert "active trip" in response.json()["detail"]


def test_replan_keeps_the_route_legal_after_a_new_order(client, auth, world, make_order):
    first = make_order(8)
    assign = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [first.id]},
    ).json()
    trip_id = assign["trip"]["id"]

    second = make_order(7)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [second.id]},
    )

    trip = client.get(f"/api/trips/{trip_id}", headers=auth).json()
    assert trip["order_count"] == 2
    assert trip["total_cargo_tons"] == 15.0

    seen = set()
    for stop in trip["stops"]:
        for order in stop["orders"]:
            if stop["stop_type"] == "pickup":
                seen.add(order["id"])
            else:
                assert order["id"] in seen


def test_reorder_preserves_completed_stops(client, auth, world, make_order):
    """Re-ordering a live trip must not erase what the driver has done."""
    a = make_order(6, world["ahmedabad"], world["vadodara"])
    b = make_order(5, world["anand"], world["surat"])
    trip = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [a.id, b.id]},
    ).json()["trip"]
    trip_id = trip["id"]

    started = client.post(f"/api/trips/{trip_id}/start", headers=auth).json()
    stops = started["stops"]
    assert len(stops) == 4

    after = client.post(
        f"/api/trips/{trip_id}/stops/{stops[0]['id']}/complete", headers=auth
    ).json()
    assert after["stops_completed"] == 1
    completed_at = after["stops"][0]["completed_at"]

    # Swap the last two pending stops, sending every stop as the API expects.
    specs = [
        {
            "stop_type": s["stop_type"],
            "order_ids": [o["id"] for o in s["orders"]],
        }
        for s in after["stops"]
    ]
    specs = specs[:2] + [specs[3], specs[2]]

    response = client.post(f"/api/trips/{trip_id}/reorder", headers=auth, json={"stops": specs})
    assert response.status_code == 200, response.text
    body = response.json()

    # The completed stop kept its place, its status and its timestamp.
    assert body["stops"][0]["status"] == "completed"
    assert body["stops"][0]["completed_at"] == completed_at
    assert body["stops_completed"] == 1
    assert body["progress_percent"] == 25.0
    # ...and the tail really did swap.
    assert [s["place_name"] for s in body["stops"][2:]] == [
        after["stops"][3]["place_name"],
        after["stops"][2]["place_name"],
    ]


def test_reorder_refuses_to_move_a_completed_stop(client, auth, world, make_order):
    order = make_order(8, world["ahmedabad"], world["surat"])
    trip = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    ).json()["trip"]
    trip_id = trip["id"]

    started = client.post(f"/api/trips/{trip_id}/start", headers=auth).json()
    after = client.post(
        f"/api/trips/{trip_id}/stops/{started['stops'][0]['id']}/complete", headers=auth
    ).json()

    specs = [
        {
            "stop_type": s["stop_type"],
            "order_ids": [o["id"] for o in s["orders"]],
        }
        for s in after["stops"]
    ]
    # Putting the delivery first would move the completed pickup.
    response = client.post(
        f"/api/trips/{trip_id}/reorder", headers=auth, json={"stops": list(reversed(specs))}
    )
    assert response.status_code == 422
    assert "already" in response.json()["detail"]["message"]


def test_replan_keeps_completed_stops(client, auth, world, make_order):
    order = make_order(9, world["ahmedabad"], world["surat"])
    trip = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    ).json()["trip"]
    trip_id = trip["id"]

    started = client.post(f"/api/trips/{trip_id}/start", headers=auth).json()
    client.post(
        f"/api/trips/{trip_id}/stops/{started['stops'][0]['id']}/complete", headers=auth
    )

    body = client.post(f"/api/trips/{trip_id}/replan", headers=auth).json()
    assert body["stops_completed"] == 1
    assert body["stops"][0]["status"] == "completed"


def test_create_order_with_typed_parties_and_addresses(client, auth):
    """Billing party and both places are free text; weight is always tons."""
    response = client.post(
        "/api/orders",
        headers=auth,
        json={
            "billing_party": "  Walk-in Traders  ",
            "order_number": " PO-7781 ",
            "material": "Cement Bags",
            "quantity_tons": 12.5,
            "pickup_name": "Kadi Godown",
            "pickup_phone": "+91 7012345678",
            "pickup_address": "Survey 44, Kadi Highway, Mehsana - 382715",
            "drop_name": "Sanand Plant Gate 3",
            "drop_phone": "+91 7098765432",
            "drop_address": "Plot 9, Sanand GIDC, Ahmedabad - 382110",
            "pickup_date": "2026-10-12",
            "special_instructions": "Weighbridge slip at both ends.",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()

    # Whitespace is trimmed on the typed fields.
    assert body["billing_party"] == "Walk-in Traders"
    assert body["order_number"] == "PO-7781"
    assert body["quantity_tons"] == 12.5
    assert body["pickup_address"] == "Survey 44, Kadi Highway, Mehsana - 382715"
    assert body["drop_phone"] == "+91 7098765432"
    assert body["pickup_date"] == "2026-10-12"
    assert body["status"] == "unassigned"
    # No delivery deadline, priority, freight or unit anywhere in the payload.
    for gone in ("deliver_by", "priority", "freight_amount", "unit", "customer"):
        assert gone not in body


def test_order_number_is_optional(client, auth):
    response = client.post(
        "/api/orders",
        headers=auth,
        json={
            "billing_party": "No Reference Co",
            "material": "Scrap Metal",
            "quantity_tons": 4,
            "pickup_name": "Yard A",
            "pickup_address": "Yard A, Rajkot",
            "drop_name": "Mill B",
            "drop_address": "Mill B, Morbi",
            "pickup_date": "2026-10-11",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["order_number"] is None


def test_stops_merge_on_the_typed_address(client, auth, world, make_order):
    """Two collections at the same typed place are one physical visit."""
    a = make_order(6, world["ahmedabad"], world["vadodara"])
    b = make_order(5, world["ahmedabad"], world["surat"])
    trip = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [a.id, b.id]},
    ).json()["trip"]

    pickups = [s for s in trip["stops"] if s["stop_type"] == "pickup"]
    assert len(pickups) == 1
    assert len(pickups[0]["orders"]) == 2
    assert pickups[0]["place_name"] == world["ahmedabad"]["name"]
    assert pickups[0]["place_address"] == world["ahmedabad"]["address"]


def test_billing_party_suggestions_come_from_past_orders(client, auth, make_order):
    make_order(5)
    parties = client.get("/api/orders/billing-parties", headers=auth).json()
    assert "ABC Industries" in parties


def test_creating_an_order_fills_the_control_rooms_address_book(client, auth, world):
    response = client.post(
        "/api/orders",
        headers=auth,
        json={
            "billing_party": "Bookkeeping Co",
            "material": "Cement Bags",
            "quantity_tons": 7,
            "pickup_name": "Kadi Godown",
            "pickup_phone": "+91 7012345678",
            "pickup_address": "Survey 44, Kadi Highway, Mehsana - 382715",
            "drop_name": "Sanand Plant",
            "drop_address": "Plot 9, Sanand GIDC, Ahmedabad - 382110",
            "pickup_date": "2026-10-12",
        },
    )
    assert response.status_code == 201, response.text

    book = client.get("/api/orders/places?mine_only=true", headers=auth).json()["items"]
    labels = {p["label"] for p in book}
    assert {"Kadi Godown", "Sanand Plant"} <= labels
    assert all(p["owner"] == "Control room" for p in book)

    kadi = next(p for p in book if p["label"] == "Kadi Godown")
    assert kadi["phone"] == "+91 7012345678"
    assert kadi["address"] == "Survey 44, Kadi Highway, Mehsana - 382715"


def test_pickup_overdue_alert_replaces_the_deadline_rules(client, auth, db, world, make_order):
    from app.services import alerts as alert_service

    stale = make_order(5, days_ahead=-3)
    created = alert_service.scan(db)
    kinds = {a.kind for a in created}
    assert "pickup_overdue" in kinds
    # The deadline-based rules are gone.
    assert "order_overdue" not in kinds
    assert "deadline_approaching" not in kinds

    overdue = [a for a in created if a.kind == "pickup_overdue"]
    assert any(a.order_id == stale.id for a in overdue)
