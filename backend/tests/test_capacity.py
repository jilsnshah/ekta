"""The central business rule: assigned load never exceeds truck capacity."""
import pytest

from app.services import capacity


def test_snapshot_starts_empty(db, world):
    snap = capacity.snapshot(db, world["truck"])
    assert snap.capacity_tons == 20.0
    assert snap.current_load_tons == 0.0
    assert snap.available_tons == 20.0
    assert snap.order_count == 0


def test_assignment_within_capacity_is_allowed(db, world, make_order):
    orders = [make_order(8), make_order(7)]
    snap = capacity.validate_assignment(db, world["truck"], orders)
    assert snap.available_tons == 20.0


def test_assignment_over_capacity_is_rejected(db, world, make_order):
    """The spec example: 8 + 7 + 6 = 21T must not fit a 20T truck."""
    from app.services import trips as trip_service

    a, b, c = make_order(8), make_order(7), make_order(6)
    trip_service.create_trip(db, world["truck"], [a, b])

    snap = capacity.snapshot(db, world["truck"])
    assert snap.current_load_tons == 15.0
    assert snap.available_tons == 5.0

    with pytest.raises(capacity.CapacityError) as excinfo:
        capacity.validate_assignment(db, world["truck"], [c])

    detail = excinfo.value.detail()
    assert detail["error"] == "capacity_exceeded"
    assert detail["available_tons"] == 5.0
    assert detail["requested_tons"] == 6.0
    assert detail["overflow_tons"] == 1.0


def test_reassigning_the_same_order_is_idempotent(db, world, make_order):
    from app.services import trips as trip_service

    order = make_order(18)
    trip_service.create_trip(db, world["truck"], [order])

    # Re-submitting an order the truck already carries must not be treated as
    # new weight.
    snap = capacity.validate_assignment(db, world["truck"], [order])
    assert snap.current_load_tons == 18.0


def test_delivered_orders_release_capacity(db, world, make_order):
    from app.models import OrderStatus
    from app.services import trips as trip_service

    order = make_order(20)
    trip_service.create_trip(db, world["truck"], [order])
    assert capacity.snapshot(db, world["truck"]).available_tons == 0.0

    order.status = OrderStatus.DELIVERED.value
    db.commit()

    assert capacity.snapshot(db, world["truck"]).available_tons == 20.0


def test_picked_up_orders_cannot_be_reassigned(db, world, make_order):
    from app.models import OrderStatus

    order = make_order(5)
    order.status = OrderStatus.PICKED_UP.value
    db.commit()

    with pytest.raises(ValueError, match="can no longer be assigned"):
        capacity.assert_assignable([order])
