"""Stop sequencing: precedence, capacity along the route, stop merging."""
import pytest

from app.models import StopType
from app.services import sequencing


def test_single_order_is_pickup_then_delivery(world, make_order):
    order = make_order(10)
    route = sequencing.plan([order], 20.0)
    assert [s.stop_type for s in route.stops] == [StopType.PICKUP, StopType.DELIVERY]


def test_delivery_never_precedes_its_pickup(world, make_order):
    orders = [
        make_order(6, world["ahmedabad"], world["vadodara"]),
        make_order(5, world["ahmedabad"], world["surat"]),
        make_order(4, world["anand"], world["vadodara"]),
    ]
    route = sequencing.plan(orders, 25.0)

    first_seen: dict = {}
    for index, stop in enumerate(route.stops):
        for order_id in stop.order_ids:
            if stop.stop_type is StopType.PICKUP:
                first_seen[order_id] = index
            else:
                assert order_id in first_seen, "delivery scheduled before its pickup"
                assert first_seen[order_id] < index


def test_pickups_at_the_same_location_merge_into_one_stop(world, make_order):
    orders = [
        make_order(6, world["ahmedabad"], world["vadodara"]),
        make_order(5, world["ahmedabad"], world["surat"]),
    ]
    route = sequencing.plan(orders, 25.0)

    pickups = [s for s in route.stops if s.stop_type is StopType.PICKUP]
    assert len(pickups) == 1
    assert len(pickups[0].order_ids) == 2


def test_capacity_forces_a_delivery_before_the_next_pickup(world, make_order):
    """Two 9T orders on a 10T truck: the route must unload between pickups."""
    orders = [
        make_order(9, world["ahmedabad"], world["vadodara"]),
        make_order(9, world["anand"], world["surat"]),
    ]
    route = sequencing.plan(orders, 10.0)

    load = 0.0
    for stop in route.stops:
        for order_id in stop.order_ids:
            quantity = next(o.quantity_tons for o in orders if o.id == order_id)
            load += quantity if stop.stop_type is StopType.PICKUP else -quantity
        assert load <= 10.0 + 1e-6


def test_every_order_gets_both_legs(world, make_order):
    orders = [make_order(4) for _ in range(3)]
    route = sequencing.plan(orders, 20.0)

    seen = {}
    for stop in route.stops:
        for order_id in stop.order_ids:
            seen.setdefault(order_id, set()).add(stop.stop_type)
    assert len(seen) == 3
    for legs in seen.values():
        assert legs == {StopType.PICKUP, StopType.DELIVERY}


def test_manual_reorder_rejects_delivery_before_pickup(world, make_order):
    order = make_order(8, world["ahmedabad"], world["surat"])
    specs = [
        {"stop_type": "delivery", "order_ids": [order.id]},
        {"stop_type": "pickup", "order_ids": [order.id]},
    ]
    with pytest.raises(ValueError, match="invalid"):
        sequencing.plan_from_manual_order([order], specs, 20.0)


def test_manual_reorder_rejects_an_overloaded_sequence(world, make_order):
    """Both pickups before either delivery breaches a 10T truck."""
    a = make_order(9, world["ahmedabad"], world["vadodara"])
    b = make_order(9, world["anand"], world["surat"])
    specs = [
        {"stop_type": "pickup", "order_ids": [a.id]},
        {"stop_type": "pickup", "order_ids": [b.id]},
        {"stop_type": "delivery", "order_ids": [a.id]},
        {"stop_type": "delivery", "order_ids": [b.id]},
    ]
    with pytest.raises(ValueError, match="invalid"):
        sequencing.plan_from_manual_order([a, b], specs, 10.0)


def test_manual_reorder_accepts_a_legal_sequence(world, make_order):
    order = make_order(8, world["ahmedabad"], world["surat"])
    specs = [
        {"stop_type": "pickup", "order_ids": [order.id]},
        {"stop_type": "delivery", "order_ids": [order.id]},
    ]
    route = sequencing.plan_from_manual_order([order], specs, 20.0)
    assert [(s.stop_type, tuple(s.order_ids)) for s in route.stops] == [
        (StopType.PICKUP, (order.id,)),
        (StopType.DELIVERY, (order.id,)),
    ]


def test_manual_reorder_requires_every_leg(world, make_order):
    order = make_order(8, world["ahmedabad"], world["surat"])
    specs = [
        {"stop_type": "pickup", "order_ids": [order.id]},
    ]
    with pytest.raises(ValueError, match="exactly one pickup and one delivery"):
        sequencing.plan_from_manual_order([order], specs, 20.0)
