"""Billing-party portal: sign-in, companies, placing orders, and isolation.

The isolation tests matter most. A trip carries several parties' orders, and
nothing here may let one party read another's data or reach a staff endpoint.
"""
import pytest

from app.models import OrderStatus


def sign_in(client, phone: str) -> dict:
    """Request and verify an OTP, returning the auth header."""
    assert client.post("/api/portal/auth/request-otp", json={"phone": phone}).status_code == 200
    response = client.post(
        "/api/portal/auth/verify", json={"phone": phone, "otp": "12345"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def add_company(client, headers, name: str) -> dict:
    response = client.post("/api/portal/companies", headers=headers, json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def place(client, headers, company_id: int, **overrides) -> dict:
    body = {
        "company_id": company_id,
        "material": "Steel Rods",
        "quantity_tons": 9,
        "pickup_name": "Naroda Godown",
        "pickup_phone": "+91 7011111111",
        "pickup_address": "Block C, Naroda GIDC, Ahmedabad - 382330",
        "drop_name": "Hazira Plant",
        "drop_address": "Gate 2, Hazira Road, Surat - 394270",
        "pickup_date": "2026-10-14",
    }
    body.update(overrides)
    response = client.post("/api/portal/orders", headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# Sign-in
# --------------------------------------------------------------------------- #
def test_first_verification_creates_the_account(client):
    headers = sign_in(client, "98765 43210")
    me = client.get("/api/portal/me", headers=headers).json()
    assert me["role"] == "party"
    # The typed number is normalised to ten digits, then shown formatted.
    assert me["phone"] == "+91 98765 43210"
    assert me["company_count"] == 0


def test_the_same_number_in_any_format_is_one_account(client):
    first = client.post(
        "/api/portal/auth/verify", json={"phone": "+91 98765-43210", "otp": "12345"}
    ).json()
    second = client.post(
        "/api/portal/auth/verify", json={"phone": "9876543210", "otp": "12345"}
    ).json()
    assert first["account_id"] == second["account_id"]


def test_a_wrong_code_is_refused(client):
    response = client.post(
        "/api/portal/auth/verify", json={"phone": "9876543210", "otp": "00000"}
    )
    assert response.status_code == 401


def test_a_malformed_number_is_refused(client):
    assert (
        client.post("/api/portal/auth/request-otp", json={"phone": "12345"}).status_code
        == 422
    )


def test_portal_endpoints_require_a_session(client):
    assert client.get("/api/portal/companies").status_code == 401
    assert client.get("/api/portal/orders").status_code == 401
    assert client.get("/api/portal/summary").status_code == 401


# --------------------------------------------------------------------------- #
# Companies
# --------------------------------------------------------------------------- #
def test_a_party_can_add_several_companies(client):
    headers = sign_in(client, "9876543210")
    add_company(client, headers, "ABC Industries")
    add_company(client, headers, "ABC Steel Trading")

    names = [c["name"] for c in client.get("/api/portal/companies", headers=headers).json()]
    assert names == ["ABC Industries", "ABC Steel Trading"]


def test_duplicate_company_names_are_refused(client):
    headers = sign_in(client, "9876543210")
    add_company(client, headers, "ABC Industries")
    clash = client.post(
        "/api/portal/companies", headers=headers, json={"name": "abc industries"}
    )
    assert clash.status_code == 409


def test_a_company_with_orders_cannot_be_removed(client):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    place(client, headers, company["id"])

    response = client.delete(f"/api/portal/companies/{company['id']}", headers=headers)
    assert response.status_code == 409
    assert "order(s) on file" in response.json()["detail"]


# --------------------------------------------------------------------------- #
# Placing and tracking
# --------------------------------------------------------------------------- #
def test_placing_an_order_reaches_the_admin_side(client, auth):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    order = place(client, headers, company["id"], order_number="PO-5521")

    assert order["stage"] == "placed"
    assert order["company_name"] == "ABC Industries"

    # The control room sees it, tagged as coming from the portal.
    admin_view = client.get(f"/api/orders/{order['id']}", headers=auth).json()
    assert admin_view["source"] == "portal"
    assert admin_view["billing_party"] == "ABC Industries"
    assert admin_view["order_number"] == "PO-5521"
    assert admin_view["placed_by_phone"] == "+91 98765 43210"
    assert admin_view["status"] == "unassigned"


def test_an_order_cannot_be_placed_for_another_partys_company(client):
    mine = sign_in(client, "9876543210")
    theirs = sign_in(client, "9000000001")
    their_company = add_company(client, theirs, "Rival Traders")

    response = client.post(
        "/api/portal/orders",
        headers=mine,
        json={
            "company_id": their_company["id"],
            "material": "Steel Rods",
            "quantity_tons": 5,
            "pickup_name": "A",
            "pickup_address": "A road",
            "drop_name": "B",
            "drop_address": "B road",
            "pickup_date": "2026-10-14",
        },
    )
    # Reported as missing rather than forbidden, so no id is confirmed.
    assert response.status_code == 404


def test_the_party_sees_the_truck_and_driver_once_assigned(
    client, auth, world, make_order
):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    order = place(client, headers, company["id"])

    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order["id"]]},
    )

    tracked = client.get(f"/api/portal/orders/{order['id']}", headers=headers).json()
    assert tracked["stage"] == "scheduled"
    assert tracked["truck_registration"] == "GJ01AB1234"
    assert tracked["driver_name"] == "Rajesh Patel"
    assert tracked["driver_phone"] == "+91 9900000000"
    assert tracked["trip_code"] is not None
    # Its own two legs, renumbered from 1.
    assert [s["stop_type"] for s in tracked["my_stops"]] == ["pickup", "delivery"]
    assert [s["sequence"] for s in tracked["my_stops"]] == [0, 1]


def test_the_party_sees_progress_as_stops_are_closed(client, auth, world):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    order = place(client, headers, company["id"])

    trip = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [order["id"]]},
    ).json()["trip"]
    started = client.post(f"/api/trips/{trip['id']}/start", headers=auth).json()

    client.post(
        f"/api/trips/{trip['id']}/stops/{started['stops'][0]['id']}/complete",
        headers=auth,
    )
    tracked = client.get(f"/api/portal/orders/{order['id']}", headers=headers).json()
    assert tracked["stage"] == "in_transit"
    assert tracked["my_stops"][0]["status"] == "completed"
    assert tracked["picked_up_at"] is not None

    client.post(
        f"/api/trips/{trip['id']}/stops/{started['stops'][1]['id']}/complete",
        headers=auth,
    )
    delivered = client.get(f"/api/portal/orders/{order['id']}", headers=headers).json()
    assert delivered["stage"] == "delivered"
    assert delivered["delivered_at"] is not None


def test_a_party_can_withdraw_only_before_a_truck_is_allocated(client, auth, world):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")

    withdrawn = client.post(
        f"/api/portal/orders/{place(client, headers, company['id'])['id']}/cancel",
        headers=headers,
    ).json()
    assert withdrawn["status"] == OrderStatus.CANCELLED.value

    booked = place(client, headers, company["id"])
    client.post(
        "/api/assignment/assign",
        headers=auth,
        json={"truck_id": world["truck"].id, "order_ids": [booked["id"]]},
    )
    refused = client.post(f"/api/portal/orders/{booked['id']}/cancel", headers=headers)
    assert refused.status_code == 422
    assert "control room" in refused.json()["detail"]


# --------------------------------------------------------------------------- #
# Isolation
# --------------------------------------------------------------------------- #
def test_a_party_only_lists_its_own_orders(client):
    mine = sign_in(client, "9876543210")
    theirs = sign_in(client, "9000000001")
    place(client, mine, add_company(client, mine, "Mine Ltd")["id"])
    place(client, theirs, add_company(client, theirs, "Theirs Ltd")["id"])

    for headers, expected in ((mine, "Mine Ltd"), (theirs, "Theirs Ltd")):
        listed = client.get("/api/portal/orders", headers=headers).json()
        assert listed["total"] == 1
        assert [o["company_name"] for o in listed["items"]] == [expected]


def test_another_partys_order_reads_as_missing(client):
    mine = sign_in(client, "9876543210")
    theirs = sign_in(client, "9000000001")
    their_order = place(client, theirs, add_company(client, theirs, "Theirs Ltd")["id"])

    assert (
        client.get(f"/api/portal/orders/{their_order['id']}", headers=mine).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/portal/orders/{their_order['id']}/cancel", headers=mine
        ).status_code
        == 404
    )


def test_a_shared_trip_never_leaks_the_other_partys_stops(client, auth, world):
    """Two parties on one truck: each sees only its own two legs."""
    mine = sign_in(client, "9876543210")
    theirs = sign_in(client, "9000000001")

    my_order = place(
        client,
        mine,
        add_company(client, mine, "Mine Ltd")["id"],
        quantity_tons=6,
        pickup_name="My Secret Yard",
        pickup_address="My Secret Yard, Ahmedabad",
        drop_name="My Drop",
        drop_address="My Drop, Surat",
    )
    their_order = place(
        client,
        theirs,
        add_company(client, theirs, "Theirs Ltd")["id"],
        quantity_tons=5,
        pickup_name="Their Secret Yard",
        pickup_address="Their Secret Yard, Anand",
        drop_name="Their Drop",
        drop_address="Their Drop, Vapi",
    )

    trip = client.post(
        "/api/assignment/assign",
        headers=auth,
        json={
            "truck_id": world["truck"].id,
            "order_ids": [my_order["id"], their_order["id"]],
        },
    ).json()["trip"]
    assert len(trip["stops"]) == 4  # the control room sees all four

    tracked = client.get(f"/api/portal/orders/{my_order['id']}", headers=mine).json()
    assert len(tracked["my_stops"]) == 2
    places = " ".join(f"{s['place_name']} {s['place_address']}" for s in tracked["my_stops"])
    assert "My Secret Yard" in places
    assert "Their" not in places
    assert "Vapi" not in places
    # No other order's code is reachable through the party payload either.
    assert their_order["code"] not in str(tracked)


def test_a_party_token_cannot_reach_staff_endpoints(client):
    headers = sign_in(client, "9876543210")
    for path in (
        "/api/trucks",
        "/api/drivers",
        "/api/orders",
        "/api/trips",
        "/api/dashboard",
        "/api/alerts",
        "/api/assignment/board",
    ):
        assert client.get(path, headers=headers).status_code == 401, path


def test_a_staff_token_cannot_reach_the_portal(client, auth):
    for path in ("/api/portal/me", "/api/portal/companies", "/api/portal/orders"):
        assert client.get(path, headers=auth).status_code == 401, path


# --------------------------------------------------------------------------- #
# The address book
# --------------------------------------------------------------------------- #
def test_placing_an_order_saves_both_addresses(client):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    place(client, headers, company["id"])

    book = client.get("/api/portal/places", headers=headers).json()["items"]
    labels = {p["label"] for p in book}
    assert labels == {"Naroda Godown", "Hazira Plant"}

    naroda = next(p for p in book if p["label"] == "Naroda Godown")
    assert naroda["address"] == "Block C, Naroda GIDC, Ahmedabad - 382330"
    assert naroda["phone"] == "+91 7011111111"
    assert naroda["use_count"] == 1


def test_the_same_place_is_not_saved_twice(client):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    place(client, headers, company["id"])
    # Same place, typed sloppily the second time.
    place(
        client,
        headers,
        company["id"],
        pickup_name="naroda godown",
        pickup_address="block c,  naroda gidc , ahmedabad - 382330",
    )

    book = client.get("/api/portal/places", headers=headers).json()["items"]
    naroda = [p for p in book if p["label"].lower().startswith("naroda")]
    assert len(naroda) == 1
    assert naroda[0]["use_count"] == 2


def test_a_place_can_be_added_edited_and_removed_by_hand(client):
    headers = sign_in(client, "9876543210")

    created = client.post(
        "/api/portal/places",
        headers=headers,
        json={
            "label": "Sanand Yard",
            "phone": "+91 7000000001",
            "address": "Plot 1, Sanand GIDC, Ahmedabad",
        },
    )
    assert created.status_code == 201, created.text
    place_id = created.json()["id"]

    renamed = client.patch(
        f"/api/portal/places/{place_id}",
        headers=headers,
        json={"label": "Sanand Yard Gate 2"},
    ).json()
    assert renamed["label"] == "Sanand Yard Gate 2"

    assert client.delete(f"/api/portal/places/{place_id}", headers=headers).status_code == 204
    assert client.get("/api/portal/places", headers=headers).json()["items"] == []


def test_one_partys_address_book_is_private(client):
    mine = sign_in(client, "9876543210")
    theirs = sign_in(client, "9000000001")

    created = client.post(
        "/api/portal/places",
        headers=theirs,
        json={"label": "Rival Yard", "address": "Secret Lane, Surat"},
    ).json()

    assert client.get("/api/portal/places", headers=mine).json()["items"] == []
    assert (
        client.patch(
            f"/api/portal/places/{created['id']}", headers=mine, json={"label": "Hijacked"}
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/portal/places/{created['id']}", headers=mine).status_code
        == 404
    )


def test_removing_a_saved_address_does_not_change_past_orders(client):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    order = place(client, headers, company["id"])

    book = client.get("/api/portal/places", headers=headers).json()["items"]
    for entry in book:
        client.delete(f"/api/portal/places/{entry['id']}", headers=headers)

    # The order kept its own copy of the address.
    tracked = client.get(f"/api/portal/orders/{order['id']}", headers=headers).json()
    assert tracked["pickup_address"] == "Block C, Naroda GIDC, Ahmedabad - 382330"


def test_the_control_room_sees_its_own_book_and_every_partys(client, auth):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    place(client, headers, company["id"])

    # A control-room entry of its own.
    client.post(
        "/api/orders/places",
        headers=auth,
        json={"label": "Depot Yard", "address": "Yard 1, Ahmedabad"},
    )

    book = client.get("/api/orders/places", headers=auth).json()["items"]
    owners = {p["label"]: p["owner"] for p in book}
    assert owners["Depot Yard"] == "Control room"
    # The customer's godown is visible, labelled as theirs.
    assert owners["Naroda Godown"] not in (None, "Control room")

    # Its own entries come first.
    assert book[0]["owner"] == "Control room"


def test_the_control_room_cannot_edit_a_partys_address(client, auth):
    headers = sign_in(client, "9876543210")
    theirs = client.post(
        "/api/portal/places",
        headers=headers,
        json={"label": "Customer Yard", "address": "Lane 4, Surat"},
    ).json()

    assert (
        client.patch(
            f"/api/orders/places/{theirs['id']}", headers=auth, json={"label": "Hijacked"}
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/orders/places/{theirs['id']}", headers=auth).status_code
        == 404
    )


def test_remember_dedupes_within_one_transaction(db):
    """The session runs with autoflush off, so this needs an explicit flush.

    Without it the lookup cannot see rows added earlier in the same
    transaction, and a batch of orders inserts one entry per order.
    """
    from app.services import places as place_service

    for _ in range(5):
        place_service.remember(
            db, "Naroda Godown", "+91 7011111111", "Block C, Naroda GIDC", None
        )
    db.commit()

    book = place_service.for_account(db, None)
    assert len(book) == 1
    assert book[0].use_count == 5
