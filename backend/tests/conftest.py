"""Test fixtures.

Each test module gets a throwaway SQLite database so the suite never touches
the development data, and the GPS simulator is kept out of the way.
"""
from __future__ import annotations

import os
import tempfile
from datetime import timedelta

import pytest

# Must be set before the app package reads its settings.
_tmp_db = os.path.join(tempfile.mkdtemp(prefix="fleet-test-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_tmp_db}"
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app.clock import utcnow  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Driver,
    OrderStatus,
    TransportOrder,
    Truck,
    User,
    UserRole,
)
from app.security import hash_password  # noqa: E402


@pytest.fixture
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    """App client with auto-seed and the alert loop disabled."""
    from app import main

    # Bypass the lifespan so no demo seed runs and no background task starts.
    app = main.app
    app.router.lifespan_context = _noop_lifespan
    with TestClient(app) as test_client:
        yield test_client


from contextlib import asynccontextmanager  # noqa: E402


@asynccontextmanager
async def _noop_lifespan(_app):
    yield


@pytest.fixture
def admin_token(db, client):
    db.add(
        User(
            email="t@example.com",
            full_name="Tester",
            hashed_password=hash_password("pw"),
            role=UserRole.ADMIN.value,
        )
    )
    db.commit()
    response = client.post(
        "/api/auth/login", json={"email": "t@example.com", "password": "pw"}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def world(db):
    """A minimal fleet: one driver, one 20T truck, four typed-in places."""
    driver = Driver(
        code="DRV-0001",
        name="Rajesh Patel",
        phone="+91 9900000000",
        license_number="GJ01-2020-1234567",
    )
    db.add(driver)
    db.flush()

    truck = Truck(
        registration_number="GJ01AB1234",
        capacity_tons=20.0,
        driver_id=driver.id,
        base_city="Ahmedabad",
    )
    db.add(truck)
    db.commit()

    def place(name, city):
        return {
            "name": name,
            "phone": "+91 7000000000",
            "address": f"Plot 1, GIDC, {city} - 380001",
        }

    return {
        "truck": truck,
        "driver": driver,
        "ahmedabad": place("Ahmedabad Warehouse", "Ahmedabad"),
        "surat": place("Surat Factory", "Surat"),
        "vadodara": place("Vadodara Factory", "Vadodara"),
        "anand": place("Anand Warehouse", "Anand"),
    }


@pytest.fixture
def make_order(db, world):
    counter = {"n": 0}

    def _make(tons: float, pickup=None, drop=None, days_ahead: int = 1):
        counter["n"] += 1
        pickup = pickup or world["ahmedabad"]
        drop = drop or world["surat"]
        order = TransportOrder(
            code=f"TO-{2000 + counter['n']}",
            order_number=f"PO-{counter['n']:04d}",
            billing_party="ABC Industries",
            material="Steel Rods",
            quantity_tons=tons,
            pickup_name=pickup["name"],
            pickup_phone=pickup["phone"],
            pickup_address=pickup["address"],
            drop_name=drop["name"],
            drop_phone=drop["phone"],
            drop_address=drop["address"],
            pickup_date=(utcnow() + timedelta(days=days_ahead)).date(),
            status=OrderStatus.UNASSIGNED.value,
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        return order

    return _make


@pytest.fixture
def items():
    """Unwrap a paginated response body down to its rows.

    List endpoints return ``{items, total, page, ...}``; most assertions only
    care about the rows.
    """

    def _items(response):
        body = response.json() if hasattr(response, "json") else response
        return body["items"] if isinstance(body, dict) and "items" in body else body

    return _items
