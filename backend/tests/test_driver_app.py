"""The driver app: sign-in, the assigned trip, closing stops, isolation.

Closing a stop here is what moves an order on for the control room and the
billing party, so these tests check the whole chain, not just the response.
"""
import pytest

from app.models import Driver, Truck


def driver_sign_in(client, phone: str) -> dict:
    assert (
        client.post("/api/driver/auth/request-otp", json={"phone": phone}).status_code
        == 200
    )
    response = client.post(
        "/api/driver/auth/verify", json={"phone": phone, "otp": "12345"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# --------------------------------------------------------------------------- #
# Sign-in
# --------------------------------------------------------------------------- #
def test_a_driver_signs_in_with_the_number_on_their_record(client, world):
    headers = driver_sign_in(client, "9900000000")
    me = client.get("/api/driver/me", headers=headers).json()
    assert me["role"] == "driver_app"
    assert me["name"] == "Rajesh Patel"
    assert me["truck_registration"] == "GJ01AB1234"
    assert me["has_active_trip"] is False


def test_the_stored_number_is_matched_in_any_format(client, world):
    # The record holds "+91 9900000000"; the driver types it bare.
    assert (
        client.post(
            "/api/driver/auth/verify", json={"phone": "99000 00000", "otp": "12345"}
        ).status_code
        == 200
    )


def test_an_unknown_number_cannot_create_a_driver(client, db, world):
    before = db.query(Driver).count()

    assert (
        client.post(
            "/api/driver/auth/request-otp", json={"phone": "9000000009"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/driver/auth/verify", json={"phone": "9000000009", "otp": "12345"}
        ).status_code
        == 404
    )
    # Unlike the party portal, signing in never adds a driver.
    assert db.query(Driver).count() == before


def test_a_wrong_code_is_refused(client, world):
    response = client.post(
        "/api/driver/auth/verify", json={"phone": "9900000000", "otp": "00000"}
    )
    assert response.status_code == 401


def test_driver_endpoints_require_a_session(client):
    assert client.get("/api/driver/me").status_code == 401
    assert client.get("/api/driver/trip/current").status_code == 401
    assert client.get("/api/driver/trips").status_code == 401


# --------------------------------------------------------------------------- #
# The assigned trip
# --------------------------------------------------------------------------- #
def test_no_trip_assigned_reads_as_null(client, world):
    headers = driver_sign_in(client, "9900000000")
    assert client.get("/api/driver/trip/current", headers=headers).json() is None


def test_the_driver_sees_the_trip_their_truck_is_on(client, auth, world, make_order):
    a = make_order(6, world["ahmedabad"], world["vadodara"])
    b = make_order(5, world["ahmedabad"], world["surat"])
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [a.id, b.id]},
    )

    headers = driver_sign_in(client, "9900000000")
    trip = client.get("/api/driver/trip/current", headers=headers).json()

    assert trip["truck_registration"] == "GJ01AB1234"
    assert trip["total_cargo_tons"] == 11.0
    assert trip["stop_count"] == 3  # both pickups share one address
    assert trip["next_stop"]["sequence"] == 0
    assert trip["next_stop"]["place_address"] == world["ahmedabad"]["address"]
    assert trip["next_stop"]["place_phone"] == world["ahmedabad"]["phone"]

    # The first stop collects both consignments, named so they can be checked.
    codes = {o["code"] for o in trip["next_stop"]["orders"]}
    assert codes == {a.code, b.code}
    assert trip["next_stop"]["load_after_tons"] == 11.0


def test_the_running_load_is_shown_per_stop(client, auth, world, make_order):
    a = make_order(6, world["ahmedabad"], world["vadodara"])
    b = make_order(5, world["ahmedabad"], world["surat"])
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [a.id, b.id]},
    )
    headers = driver_sign_in(client, "9900000000")
    stops = client.get("/api/driver/trip/current", headers=headers).json()["stops"]

    # Up to 11T after collecting, then down to zero as it is dropped off.
    assert [s["load_after_tons"] for s in stops] == [11.0, 5.0, 0.0]


# --------------------------------------------------------------------------- #
# Driving the trip
# --------------------------------------------------------------------------- #
def test_the_driver_starts_the_trip_and_closes_stops_in_order(
    client, auth, world, make_order
):
    order = make_order(8)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )
    headers = driver_sign_in(client, "9900000000")
    trip = client.get("/api/driver/trip/current", headers=headers).json()

    # Stops cannot be closed before the trip starts.
    early = client.post(
        f"/api/driver/trips/{trip['id']}/stops/{trip['stops'][0]['id']}/complete",
        headers=headers,
    )
    assert early.status_code == 422
    assert "Start the trip" in early.json()["detail"]["message"]

    started = client.post(f"/api/driver/trips/{trip['id']}/start", headers=headers).json()
    assert started["status"] == "in_progress"

    # Nor out of order.
    skipped = client.post(
        f"/api/driver/trips/{trip['id']}/stops/{trip['stops'][1]['id']}/complete",
        headers=headers,
    )
    assert skipped.status_code == 422
    assert "first" in skipped.json()["detail"]["message"]

    after = client.post(
        f"/api/driver/trips/{trip['id']}/stops/{trip['stops'][0]['id']}/complete",
        headers=headers,
    ).json()
    assert after["stops_completed"] == 1
    assert after["next_stop"]["stop_type"] == "delivery"

    # Closing the same stop twice is a no-op, not an error.
    again = client.post(
        f"/api/driver/trips/{trip['id']}/stops/{trip['stops'][0]['id']}/complete",
        headers=headers,
    )
    assert again.status_code == 200
    assert again.json()["stops_completed"] == 1


def test_closing_the_last_stop_frees_the_truck_everywhere(
    client, auth, world, make_order
):
    order = make_order(8)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )
    headers = driver_sign_in(client, "9900000000")
    trip = client.get("/api/driver/trip/current", headers=headers).json()
    client.post(f"/api/driver/trips/{trip['id']}/start", headers=headers)

    for stop in trip["stops"]:
        client.post(
            f"/api/driver/trips/{trip['id']}/stops/{stop['id']}/complete",
            headers=headers,
        )

    # The driver has nothing left to do.
    assert client.get("/api/driver/trip/current", headers=headers).json() is None

    # The control room sees the truck available and the order delivered.
    truck = client.get(f"/api/trucks/{world['truck'].id}", headers=auth).json()
    assert truck["status"] == "available"
    assert truck["capacity"]["current_load_tons"] == 0.0
    assert client.get(f"/api/orders/{order.id}", headers=auth).json()["status"] == "delivered"


def test_a_driver_update_reaches_the_billing_party(client, auth, world):
    """The three audiences share one source of truth: the driver's taps."""
    party = client.post(
        "/api/portal/auth/verify", json={"phone": "9876543210", "otp": "12345"}
    ).json()
    party_headers = {"Authorization": f"Bearer {party['access_token']}"}
    company = client.post(
        "/api/portal/companies", headers=party_headers, json={"name": "ABC Industries"}
    ).json()
    order = client.post(
        "/api/portal/orders",
        headers=party_headers,
        json={
            "company_id": company["id"],
            "material": "Steel Rods",
            "quantity_tons": 7,
            "pickup_name": "Naroda Godown",
            "pickup_address": "Block C, Naroda GIDC, Ahmedabad",
            "drop_name": "Hazira Plant",
            "drop_address": "Gate 2, Hazira Road, Surat",
            "pickup_date": "2026-10-14",
        },
    ).json()

    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order["id"]]},
    )

    driver_headers = driver_sign_in(client, "9900000000")
    trip = client.get("/api/driver/trip/current", headers=driver_headers).json()
    client.post(f"/api/driver/trips/{trip['id']}/start", headers=driver_headers)
    client.post(
        f"/api/driver/trips/{trip['id']}/stops/{trip['stops'][0]['id']}/complete",
        headers=driver_headers,
    )

    tracked = client.get(
        f"/api/portal/orders/{order['id']}", headers=party_headers
    ).json()
    assert tracked["stage"] == "in_transit"
    assert tracked["my_stops"][0]["status"] == "completed"


def test_the_driver_can_report_and_clear_a_delay(client, auth, world, make_order):
    order = make_order(8)
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    )
    headers = driver_sign_in(client, "9900000000")
    trip = client.get("/api/driver/trip/current", headers=headers).json()
    client.post(f"/api/driver/trips/{trip['id']}/start", headers=headers)

    reported = client.post(
        f"/api/driver/trips/{trip['id']}/report-delay",
        headers=headers,
        json={"reason": "Highway blocked past Bagodara"},
    ).json()
    assert reported["is_delayed"] is True

    # The control room sees the truck flagged and an alert naming the reason.
    assert client.get(f"/api/trucks/{world['truck'].id}", headers=auth).json()["status"] == "delayed"
    alerts = client.get("/api/alerts", headers=auth).json()["items"]
    reported_alerts = [a for a in alerts if a["kind"] == "driver_reported_delay"]
    assert reported_alerts
    assert "Bagodara" in reported_alerts[0]["message"]

    cleared = client.post(
        f"/api/driver/trips/{trip['id']}/clear-delay", headers=headers
    ).json()
    assert cleared["is_delayed"] is False
    assert client.get(f"/api/trucks/{world['truck'].id}", headers=auth).json()["status"] == "in_transit"


# --------------------------------------------------------------------------- #
# Isolation
# --------------------------------------------------------------------------- #
def test_a_driver_cannot_touch_another_drivers_trip(
    client, auth, db, world, make_order
):
    order = make_order(8)
    trip = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order.id]},
    ).json()["trip"]

    # A second driver with their own truck and no trip.
    other = Driver(
        code="DRV-0002",
        name="Other Driver",
        phone="+91 9000000002",
        license_number="GJ02-2021-7654321",
    )
    db.add(other)
    db.flush()
    db.add(Truck(registration_number="GJ01AB9999", capacity_tons=15, driver_id=other.id))
    db.commit()

    headers = driver_sign_in(client, "9000000002")
    assert client.get("/api/driver/trip/current", headers=headers).json() is None
    assert client.get(f"/api/driver/trips/{trip['id']}", headers=headers).status_code == 404
    assert (
        client.post(f"/api/driver/trips/{trip['id']}/start", headers=headers).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/driver/trips/{trip['id']}/stops/{trip['stops'][0]['id']}/complete",
            headers=headers,
        ).status_code
        == 404
    )


def test_a_driver_token_cannot_reach_staff_or_portal_endpoints(client, world):
    headers = driver_sign_in(client, "9900000000")
    for path in ("/api/trucks", "/api/orders", "/api/dashboard", "/api/assignment/board"):
        assert client.get(path, headers=headers).status_code == 401, path
    for path in ("/api/portal/me", "/api/portal/orders"):
        assert client.get(path, headers=headers).status_code == 401, path


def test_staff_and_party_tokens_cannot_reach_the_driver_app(client, auth):
    party = client.post(
        "/api/portal/auth/verify", json={"phone": "9876543210", "otp": "12345"}
    ).json()
    party_headers = {"Authorization": f"Bearer {party['access_token']}"}

    for headers in (auth, party_headers):
        assert client.get("/api/driver/me", headers=headers).status_code == 401
        assert client.get("/api/driver/trip/current", headers=headers).status_code == 401
