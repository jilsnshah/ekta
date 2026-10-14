"""Customers, linked end to end.

The promise under test: the control room can raise an order for a customer
who has never used the portal, and when that customer signs in with the same
number they find the order -- and their companies and addresses -- already
there. And the reverse: whatever a customer does in the portal is visible to
the control room on that customer's page.
"""
from tests.test_portal import add_company, place, sign_in


def order_body(**overrides):
    body = {
        "material": "Cement Bags",
        "quantity_tons": 12,
        "pickup_name": "Sanand Plant",
        "pickup_phone": "+91 7022222222",
        "pickup_address": "Plot 9, Sanand GIDC, Ahmedabad - 382110",
        "drop_name": "Vapi Warehouse",
        "drop_address": "Phase 2, Vapi GIDC, Vapi - 396195",
        "pickup_date": "2026-10-20",
    }
    body.update(overrides)
    return body


def new_customer(client, auth, phone="9811122233", name="Hemant Sutaria", company="Shakti Steel"):
    response = client.post(
        "/api/customers",
        headers=auth,
        json={"phone": phone, "full_name": name, "company": {"name": company}},
    )
    assert response.status_code == 201, response.text
    return response.json()


# ------------------------------- the promise ------------------------------- #
def test_an_order_raised_by_the_control_room_appears_in_the_customers_portal(
    client, auth
):
    customer = new_customer(client, auth)
    company = customer["companies"][0]

    raised = client.post(
        "/api/orders", headers=auth, json=order_body(company_id=company["id"])
    )
    assert raised.status_code == 201, raised.text
    order = raised.json()
    # Billed under the company's name and linked back to the customer.
    assert order["billing_party"] == "Shakti Steel"
    assert order["company_id"] == company["id"]
    assert order["customer_id"] == customer["id"]
    assert order["source"] == "admin"

    # The customer signs in for the first time, typing the number differently.
    headers = sign_in(client, "+91 98111 22233")
    me = client.get("/api/portal/me", headers=headers).json()
    assert me["account_id"] == customer["id"]
    assert me["full_name"] == "Hemant Sutaria"
    assert me["company_count"] == 1

    mine = client.get("/api/portal/orders", headers=headers).json()
    assert [o["code"] for o in mine["items"]] == [order["code"]]
    # The portal can tell them the control room booked it.
    assert mine["items"][0]["booked_by_us"] is True
    assert client.get(f"/api/portal/orders/{order['id']}", headers=headers).status_code == 200

    summary = client.get("/api/portal/summary", headers=headers).json()
    assert summary["total"] == 1
    assert summary["awaiting_truck"] == 1

    companies = client.get("/api/portal/companies", headers=headers).json()
    assert [c["name"] for c in companies] == ["Shakti Steel"]
    assert companies[0]["order_count"] == 1

    # Both addresses were saved to the customer's own book, ready to reuse.
    places = client.get("/api/portal/places", headers=headers).json()
    assert {p["label"] for p in places["items"]} == {"Sanand Plant", "Vapi Warehouse"}


def test_what_the_customer_does_in_the_portal_shows_on_their_control_room_page(
    client, auth
):
    headers = sign_in(client, "9876543210")
    company = add_company(client, headers, "ABC Industries")
    placed = place(client, headers, company["id"])

    found = client.get("/api/customers?search=98765", headers=auth).json()
    assert found["total"] == 1
    customer = found["items"][0]
    assert customer["company_names"] == ["ABC Industries"]
    assert customer["order_count"] == 1
    assert customer["last_login_at"] is not None

    detail = client.get(f"/api/customers/{customer['id']}", headers=auth).json()
    assert detail["companies"][0]["name"] == "ABC Industries"

    orders = client.get(f"/api/orders?customer_id={customer['id']}", headers=auth).json()
    assert [o["code"] for o in orders["items"]] == [placed["code"]]
    assert orders["items"][0]["customer_id"] == customer["id"]


def test_one_customer_never_sees_anothers_orders(client, auth):
    first = new_customer(client, auth, phone="9811100001", company="First Co")
    second = new_customer(client, auth, phone="9811100002", company="Second Co")
    order = client.post(
        "/api/orders",
        headers=auth,
        json=order_body(company_id=first["companies"][0]["id"]),
    ).json()

    intruder = sign_in(client, "9811100002")
    assert client.get("/api/portal/orders", headers=intruder).json()["total"] == 0
    assert (
        client.get(f"/api/portal/orders/{order['id']}", headers=intruder).status_code
        == 404
    )
    assert second["id"] != first["id"]


# ------------------------------- the details ------------------------------- #
def test_a_number_belongs_to_one_customer(client, auth):
    customer = new_customer(client, auth, phone="9811122233")
    clash = client.post(
        "/api/customers", headers=auth, json={"phone": "+91-98111-22233"}
    )
    assert clash.status_code == 409
    # The existing customer is named, so the form can switch to them.
    assert clash.json()["detail"]["customer_id"] == customer["id"]

    looked_up = client.get("/api/customers/lookup?phone=98111 22233", headers=auth)
    assert looked_up.json()["id"] == customer["id"]
    assert client.get("/api/customers/lookup?phone=9800000000", headers=auth).json() is None


def test_an_order_needs_a_company_or_a_typed_name(client, auth):
    assert client.post("/api/orders", headers=auth, json=order_body()).status_code == 422
    assert (
        client.post("/api/orders", headers=auth, json=order_body(company_id=99999)).status_code
        == 404
    )
    # A one-off with a typed name still works, and belongs to nobody.
    one_off = client.post(
        "/api/orders", headers=auth, json=order_body(billing_party="Walk-in Trader")
    ).json()
    assert one_off["customer_id"] is None


def test_the_control_room_can_add_and_correct_a_customers_companies(client, auth):
    customer = new_customer(client, auth)
    added = client.post(
        f"/api/customers/{customer['id']}/companies",
        headers=auth,
        json={"name": "Shakti Pipes", "gst_number": "24ABCDE1234F1Z5"},
    )
    assert added.status_code == 201
    assert (
        client.post(
            f"/api/customers/{customer['id']}/companies",
            headers=auth,
            json={"name": "shakti pipes"},
        ).status_code
        == 409
    )
    renamed = client.patch(
        f"/api/customers/companies/{added.json()['id']}",
        headers=auth,
        json={"contact_person": "Ritesh"},
    )
    assert renamed.json()["contact_person"] == "Ritesh"

    # The customer sees the company the control room added.
    headers = sign_in(client, "9811122233")
    names = {c["name"] for c in client.get("/api/portal/companies", headers=headers).json()}
    assert names == {"Shakti Steel", "Shakti Pipes"}


def test_customer_list_filters(client, auth):
    new_customer(client, auth, phone="9811100001", name="Never Signed In", company="Quiet Co")
    sign_in(client, "9811100002")  # signs up through the portal

    never = client.get("/api/customers?signed_in=false", headers=auth).json()
    assert [c["full_name"] for c in never["items"]] == ["Never Signed In"]
    assert client.get("/api/customers?signed_in=true", headers=auth).json()["total"] == 1

    by_company = client.get("/api/customers?search=quiet", headers=auth).json()
    assert by_company["total"] == 1
    companies = client.get("/api/customers/companies?search=quiet", headers=auth).json()
    assert companies["items"][0]["customer_name"] == "Never Signed In"


def test_the_order_forms_address_book_puts_the_customers_own_first(client, auth):
    customer = new_customer(client, auth)
    client.post(
        "/api/orders",
        headers=auth,
        json=order_body(company_id=customer["companies"][0]["id"]),
    )
    client.post("/api/orders/places", headers=auth, json={
        "label": "Control Room Yard", "address": "Yard 1, Aslali - 382427"
    })

    book = client.get(
        f"/api/orders/places?account_id={customer['id']}", headers=auth
    ).json()["items"]
    owners = [p["owner"] for p in book]
    assert owners[:2] == ["Hemant Sutaria", "Hemant Sutaria"]
    assert "Control room" in owners

    own = client.get(
        f"/api/orders/places?account_id={customer['id']}&only_account=true", headers=auth
    ).json()["items"]
    assert {p["owner"] for p in own} == {"Hemant Sutaria"}


def test_search_finds_a_customer_by_number(client, auth):
    customer = new_customer(client, auth)
    hits = client.get("/api/search?q=22233", headers=auth).json()["hits"]
    assert any(h["kind"] == "customer" and h["id"] == customer["id"] for h in hits)


def test_a_party_token_cannot_read_the_customer_list(client):
    headers = sign_in(client, "9811100009")
    assert client.get("/api/customers", headers=headers).status_code == 401
