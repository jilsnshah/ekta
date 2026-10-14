"""Trip stop sequencing.

A trip is a sequence of *tasks*: one pickup and one delivery per order. Two
hard constraints apply:

  1. Precedence -- an order's delivery can never precede its pickup.
  2. Capacity   -- the load on board after any pickup must stay within the
                   truck's rated capacity.

There is no geography and no delivery deadline in the system, so there is
nothing to optimise against. The default order is simply: collect in pickup
date order, then deliver in the order things were collected, pulling a
delivery forward whenever the next pickup would otherwise overload the truck.
Consecutive tasks at the same address merge into one physical stop, and the
operator can rearrange the result by hand.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional, Sequence

from ..models import StopType, TransportOrder


@dataclass
class Place:
    """Where a stop happens, as typed on the order."""

    name: str
    phone: Optional[str]
    address: str

    @property
    def key(self) -> str:
        """Identity used to merge two tasks into one visit.

        Addresses are typed by hand, so they are compared on a normalised
        form: case-insensitive, punctuation and repeated whitespace removed.
        """
        raw = f"{self.name}|{self.address}".lower()
        return re.sub(r"[^a-z0-9|]+", " ", raw).strip()


@dataclass
class Task:
    order_id: int
    order_code: str
    stop_type: StopType
    place: Place
    quantity_tons: float
    pickup_date: date

    @property
    def key(self) -> str:
        return f"{self.stop_type.value}:{self.order_id}"


@dataclass
class PlannedStop:
    place: Place
    stop_type: StopType
    order_ids: List[int] = field(default_factory=list)


@dataclass
class RoutePlan:
    stops: List[PlannedStop]


def pickup_place(order: TransportOrder) -> Place:
    return Place(order.pickup_name, order.pickup_phone, order.pickup_address)


def drop_place(order: TransportOrder) -> Place:
    return Place(order.drop_name, order.drop_phone, order.drop_address)


def build_tasks(orders: Sequence[TransportOrder]) -> List[Task]:
    tasks: List[Task] = []
    for order in orders:
        tasks.append(
            Task(
                order_id=order.id,
                order_code=order.code,
                stop_type=StopType.PICKUP,
                place=pickup_place(order),
                quantity_tons=order.quantity_tons,
                pickup_date=order.pickup_date,
            )
        )
        tasks.append(
            Task(
                order_id=order.id,
                order_code=order.code,
                stop_type=StopType.DELIVERY,
                place=drop_place(order),
                quantity_tons=order.quantity_tons,
                pickup_date=order.pickup_date,
            )
        )
    return tasks


def is_feasible(sequence: Sequence[Task], capacity: float) -> bool:
    """Precedence + capacity check for a full task ordering."""
    picked: set = set()
    load = 0.0
    for task in sequence:
        if task.stop_type is StopType.PICKUP:
            if task.order_id in picked:
                return False
            load += task.quantity_tons
            # Tolerance absorbs float noise on values like 0.1 tons.
            if load > capacity + 1e-6:
                return False
            picked.add(task.order_id)
        else:
            if task.order_id not in picked:
                return False
            load -= task.quantity_tons
    return True


def _sequence(tasks: Sequence[Task], capacity: float) -> List[Task]:
    """Collect by pickup date, deliver in the order collected."""
    pickups = sorted(
        (t for t in tasks if t.stop_type is StopType.PICKUP),
        key=lambda t: (t.pickup_date, t.order_id),
    )
    deliveries = {t.order_id: t for t in tasks if t.stop_type is StopType.DELIVERY}

    ordered: List[Task] = []
    # Pickups whose delivery is still outstanding, oldest collection first.
    on_board: List[Task] = []
    load = 0.0
    here: Optional[str] = None

    def deliver(pickup: Task) -> None:
        nonlocal load, here
        delivery = deliveries[pickup.order_id]
        ordered.append(delivery)
        on_board.remove(pickup)
        load -= pickup.quantity_tons
        here = delivery.place.key

    for pickup in pickups:
        # Make room: drop what is already aboard, oldest first, until the
        # next collection fits.
        while on_board and load + pickup.quantity_tons > capacity + 1e-6:
            deliver(on_board[0])

        ordered.append(pickup)
        on_board.append(pickup)
        load += pickup.quantity_tons
        here = pickup.place.key

    # Anything still aboard is delivered in the order it was collected, except
    # that a drop at the address we are already standing at goes first.
    while on_board:
        at_hand = next(
            (p for p in on_board if deliveries[p.order_id].place.key == here), None
        )
        deliver(at_hand or on_board[0])

    return ordered


def tasks_to_stops(sequence: Sequence[Task]) -> RoutePlan:
    """Collapse a task ordering into physical stops."""
    stops: List[PlannedStop] = []
    for task in sequence:
        merge = (
            stops
            and stops[-1].place.key == task.place.key
            and stops[-1].stop_type is task.stop_type
        )
        if merge:
            stops[-1].order_ids.append(task.order_id)
            continue
        stops.append(
            PlannedStop(
                place=task.place,
                stop_type=task.stop_type,
                order_ids=[task.order_id],
            )
        )
    return RoutePlan(stops=stops)


def plan(orders: Sequence[TransportOrder], capacity: float) -> RoutePlan:
    """Full pipeline: tasks -> pickup-date ordering -> merged stops."""
    if not orders:
        return RoutePlan(stops=[])
    return tasks_to_stops(_sequence(build_tasks(orders), capacity))


def plan_from_manual_order(
    orders: Sequence[TransportOrder],
    stop_specs: Sequence[Dict],
    capacity: float,
    locked_stops: int = 0,
) -> RoutePlan:
    """Rebuild a plan from an admin-supplied stop ordering.

    ``stop_specs`` is a list of ``{"stop_type", "order_ids"}`` dicts covering
    *every* stop on the trip. Precedence and capacity are re-validated across
    the whole sequence, so a manual reorder can never produce an illegal
    route.

    ``locked_stops`` is the number of leading stops that have already been
    completed. They still take part in validation -- the load they left on
    board constrains everything after them -- but they are excluded from the
    returned plan, because a completed stop must keep its row and its
    timestamp rather than being rebuilt.
    """
    by_key = {t.key: t for t in build_tasks(orders)}
    sequence: List[Task] = []
    boundary: Optional[int] = None

    for index, spec in enumerate(stop_specs):
        if index == locked_stops:
            boundary = len(sequence)
        stop_type = StopType(spec["stop_type"])
        for order_id in spec["order_ids"]:
            task = by_key.get(f"{stop_type.value}:{order_id}")
            if task is None:
                raise ValueError(
                    f"Stop references order {order_id} which is not on this trip"
                )
            sequence.append(task)

    if boundary is None:
        boundary = len(sequence)

    if len(sequence) != len(by_key):
        raise ValueError(
            "Manual route must contain exactly one pickup and one delivery per order"
        )
    if not is_feasible(sequence, capacity):
        raise ValueError(
            "Manual route is invalid: a delivery precedes its pickup, or the load "
            "exceeds truck capacity at some point along the route"
        )

    # Merging happens only within the returned tail, so its stop indices line
    # up exactly with the rows the caller is about to replace.
    return tasks_to_stops(sequence[boundary:])
