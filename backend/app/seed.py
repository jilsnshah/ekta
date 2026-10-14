"""Demo data generator.

Produces a fleet that exercises every screen: 72 trucks each with a driver,
a realistic spread of statuses, a backlog of unassigned transport orders,
trips part-way through their stops, and completed trip history.

Run standalone with:  python -m app.seed [--reset]
"""
from __future__ import annotations

import argparse
import random
from datetime import timedelta
from typing import Dict, List, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from .clock import utcnow
from .database import Base, SessionLocal, engine
from .models import (
    Company,
    Driver,
    DriverStatus,
    OrderSource,
    OrderStatus,
    PartyAccount,
    StopStatus,
    TransportOrder,
    Trip,
    Truck,
    TruckStatus,
    User,
    UserRole,
)
from .security import hash_password
from .services import places as place_service
from .services import trips as trip_service

RNG = random.Random(20261005)

CITIES: List[str] = [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar",
    "Anand", "Nadiad", "Bharuch", "Ankleshwar", "Mehsana", "Gandhinagar",
    "Morbi", "Junagadh", "Porbandar", "Vapi", "Valsad", "Navsari",
    "Palanpur", "Himatnagar", "Bhuj", "Gandhidham", "Mundra", "Veraval",
    "Amreli", "Surendranagar", "Dahej", "Hazira", "Kandla", "Silvassa",
    "Mumbai", "Pune", "Nashik", "Nagpur", "Indore", "Udaipur", "Jaipur",
    "Hyderabad",
]

FACILITY_KINDS = [
    "Warehouse", "Factory", "Industrial Estate", "Logistics Park",
    "Port Terminal", "Cold Store", "Godown", "Plant",
]

FIRST_NAMES = [
    "Rajesh", "Mahesh", "Suresh", "Dinesh", "Jignesh", "Hitesh", "Nilesh",
    "Bhavesh", "Kiran", "Pravin", "Ashok", "Vikram", "Sandeep", "Amit",
    "Manoj", "Rakesh", "Prakash", "Deepak", "Arvind", "Haresh", "Chetan",
    "Vipul", "Mukesh", "Paresh", "Alpesh", "Tushar", "Ravi", "Sanjay",
    "Yogesh", "Kalpesh", "Harshad", "Bharat", "Naresh", "Girish", "Jitendra",
    "Vinod",
]
LAST_NAMES = [
    "Patel", "Shah", "Desai", "Joshi", "Mehta", "Trivedi", "Chauhan",
    "Solanki", "Rathod", "Parmar", "Vaghela", "Makwana", "Thakor", "Dave",
    "Bhatt", "Pandya", "Gohil", "Jadeja", "Zala", "Rana",
]

BILLING_PARTIES = [
    "ABC Industries",
    "Shakti Steel Works",
    "Gujarat Cement Corporation",
    "Sunrise Polymers",
    "Krishna Agro Exports",
    "Apex Ceramics",
    "Western Chemicals Ltd",
    "Deccan Textiles",
    "Patel Hardware & Pipes",
    "Blue Ocean Foods",
    "Nirman Infra Projects",
    "Veer Packaging",
    "Saurashtra Oil Mills",
    "Metro Electricals",
    "Rudra Pharma",
    "Everest Tiles",
    "Narmada Fertilisers",
    "Arya Auto Components",
]

MATERIALS = [
    ("Steel Rods", 6, 24),
    ("Cement Bags", 8, 28),
    ("PVC Pipes", 3, 14),
    ("Ceramic Tiles", 5, 20),
    ("Cotton Bales", 4, 16),
    ("Industrial Chemicals", 5, 18),
    ("Edible Oil Drums", 6, 22),
    ("Packaged Food", 3, 12),
    ("Fertiliser", 9, 26),
    ("Auto Components", 2, 10),
    ("Copper Coils", 4, 15),
    ("Pharma Cartons", 2, 8),
    ("Granite Slabs", 7, 25),
    ("Plastic Granules", 5, 18),
    ("Scrap Metal", 8, 27),
    ("Textile Rolls", 3, 13),
]

TRUCK_MODELS = [
    ("Tata", "Signa 4825.TK", 6, "Trailer"),
    ("Tata", "LPT 3118", 4, "Open Body"),
    ("Ashok Leyland", "4220 10x2", 5, "Container"),
    ("Ashok Leyland", "2820 Haulage", 4, "Tipper"),
    ("BharatBenz", "3528CM", 4, "Tipper"),
    ("BharatBenz", "4028TT", 6, "Trailer"),
    ("Eicher", "Pro 6055", 3, "Open Body"),
    ("Mahindra", "Blazo X 55", 5, "Container"),
    ("Volvo", "FM 480", 6, "Trailer"),
    ("Scania", "P 410", 5, "Tipper"),
]

CAPACITY_POOL = [9, 12, 15, 16, 18, 20, 20, 22, 25, 25, 28, 30, 32, 35]

INSTRUCTIONS = [
    "Tarpaulin mandatory - monsoon route.",
    "Call consignee 1 hour before arrival.",
    "Weighbridge slip required at both ends.",
    "Fragile consignment - no stacking above 2 layers.",
    "Night driving not permitted for this cargo.",
    "Hazardous goods - TREM card must be carried.",
    "Gate pass pre-approved, quote PO number at security.",
    None,
    None,
    None,
]


class Place:
    """A typed-in site, reused across orders so stops merge realistically."""

    def __init__(self, city: str, kind: str) -> None:
        self.city = city
        self.name = f"{city} {kind}"
        self.phone = f"+91 7{RNG.randint(100000000, 999999999)}"
        self.address = (
            f"Plot {RNG.randint(10, 480)}, {RNG.choice(['GIDC', 'MIDC', 'Industrial Area'])}, "
            f"{city} - {RNG.randint(360001, 396999)}"
        )


def _build_places() -> Dict[str, List[Place]]:
    by_city: Dict[str, List[Place]] = {}
    for city in CITIES:
        count = 2 if city in {"Ahmedabad", "Surat", "Vadodara", "Rajkot", "Mumbai"} else 1
        # Distinct kinds per city, so no city ends up with two sites of the
        # same name at different addresses.
        kinds = RNG.sample(FACILITY_KINDS, count)
        by_city[city] = [Place(city, kind) for kind in kinds]
    return by_city


def _build_drivers(db: Session) -> List[Driver]:
    drivers: List[Driver] = []
    used = set()
    for index in range(1, 73):
        while True:
            name = f"{RNG.choice(FIRST_NAMES)} {RNG.choice(LAST_NAMES)}"
            if name not in used:
                used.add(name)
                break
        driver = Driver(
            code=f"DRV-{index:04d}",
            name=name,
            # A fixed number for the first driver, so the demo driver login is
            # the same after every reseed.
            phone=(
                "+91 90000 00001"
                if index == 1
                else f"+91 9{RNG.randint(100000000, 999999999)}"
            ),
            license_number=(
                f"GJ{RNG.randint(10, 39)}-{2015 + index % 9}-"
                f"{RNG.randint(1000000, 9999999)}"
            ),
            license_expiry=utcnow() + timedelta(days=RNG.randint(90, 2000)),
            status=DriverStatus.AVAILABLE.value,
            home_city=RNG.choice(CITIES[:26]),
        )
        db.add(driver)
        drivers.append(driver)
    db.flush()
    return drivers


def _build_trucks(db: Session, drivers: List[Driver]) -> List[Truck]:
    trucks: List[Truck] = []
    now = utcnow()
    for index in range(1, 73):
        make, model, axles, body = TRUCK_MODELS[(index - 1) % len(TRUCK_MODELS)]
        truck = Truck(
            registration_number=f"GJ01AB{1000 + index}",
            capacity_tons=float(CAPACITY_POOL[(index * 5) % len(CAPACITY_POOL)]),
            status=TruckStatus.AVAILABLE.value,
            driver_id=drivers[index - 1].id,
            base_city=CITIES[(index * 3) % 26],
            make=make,
            model=model,
            year=2018 + (index % 7),
            axles=axles,
            body_type=body,
            fuel_type="Diesel" if index % 9 else "CNG",
            odometer_km=float(RNG.randint(45_000, 480_000)),
            insurance_expiry=now + timedelta(days=RNG.randint(20, 700)),
            fitness_expiry=now + timedelta(days=RNG.randint(40, 900)),
            last_service_km=float(RNG.randint(40_000, 440_000)),
        )
        db.add(truck)
        trucks.append(truck)
    db.flush()
    return trucks


def _make_order(
    db: Session,
    seq: int,
    places: List[Place],
    max_tons: float,
    pickup_city: str = None,
    day_offset: int = 0,
) -> TransportOrder:
    material, low, high = RNG.choice(MATERIALS)
    # Clamp the band to the space actually left on the truck so a generated
    # order can never breach the capacity invariant.
    ceiling = max(1, int(max_tons))
    low = min(low, ceiling)
    high = max(low, min(high, ceiling))
    tons = float(RNG.randint(low, high))

    pool = [p for p in places if p.city == pickup_city] if pickup_city else places
    pickup = RNG.choice(pool or places)
    drop = RNG.choice([p for p in places if p.city != pickup.city])

    now = utcnow()
    order = TransportOrder(
        code=f"TO-{1000 + seq}",
        # Roughly half the parties quote their own reference.
        order_number=(
            f"PO-{RNG.randint(10000, 99999)}" if RNG.random() < 0.55 else None
        ),
        billing_party=RNG.choice(BILLING_PARTIES),
        material=material,
        quantity_tons=tons,
        pickup_name=pickup.name,
        pickup_phone=pickup.phone,
        pickup_address=pickup.address,
        drop_name=drop.name,
        drop_phone=drop.phone,
        drop_address=drop.address,
        pickup_date=(now + timedelta(days=day_offset + RNG.randint(-1, 6))).date(),
        special_instructions=RNG.choice(INSTRUCTIONS),
        status=OrderStatus.UNASSIGNED.value,
        created_at=now - timedelta(hours=RNG.randint(1, 50)),
    )
    db.add(order)
    return order


def seed(db: Session) -> None:
    now = utcnow()

    by_city = _build_places()
    places = [p for group in by_city.values() for p in group]
    drivers = _build_drivers(db)
    trucks = _build_trucks(db, drivers)

    db.add(
        User(
            email="admin@fleetops.in",
            full_name="Fleet Control Room",
            hashed_password=hash_password("admin123"),
            role=UserRole.ADMIN.value,
        )
    )
    # One driver login so the driver-facing role is demonstrable.
    db.add(
        User(
            email="driver@fleetops.in",
            full_name=drivers[0].name,
            hashed_password=hash_password("driver123"),
            role=UserRole.DRIVER.value,
            driver_id=drivers[0].id,
        )
    )
    db.flush()

    seq = 0

    plan: List[Tuple[str, int]] = [
        (TruckStatus.IN_TRANSIT.value, 33),
        (TruckStatus.AT_PICKUP.value, 8),
        (TruckStatus.AT_DELIVERY.value, 5),
        (TruckStatus.DELAYED.value, 3),
        (TruckStatus.ASSIGNED.value, 10),
        (TruckStatus.AVAILABLE.value, 12),
        (TruckStatus.MAINTENANCE.value, 1),
    ]
    assert sum(n for _, n in plan) == 72

    pool = list(trucks)
    RNG.shuffle(pool)
    # The demo driver (DRV-0001) should have something to do on first login,
    # so their truck is moved to the front of the in-transit bucket.
    demo_truck = next((t for t in pool if t.driver_id == drivers[0].id), None)
    if demo_truck is not None:
        pool.remove(demo_truck)
        pool.insert(0, demo_truck)
    cursor = 0
    buckets: Dict[str, List[Truck]] = {}
    for status, count in plan:
        buckets[status] = pool[cursor : cursor + count]
        cursor += count

    live_statuses = (
        TruckStatus.IN_TRANSIT.value,
        TruckStatus.AT_PICKUP.value,
        TruckStatus.AT_DELIVERY.value,
        TruckStatus.DELAYED.value,
    )

    # --- trips already under way ------------------------------------------- #
    for status in live_statuses:
        for truck in buckets[status]:
            remaining = truck.capacity_tons * RNG.uniform(0.6, 0.95)
            orders: List[TransportOrder] = []
            for _ in range(RNG.choices([1, 2, 3], weights=[3, 4, 3])[0]):
                if remaining < 2:
                    break
                seq += 1
                order = _make_order(
                    db,
                    seq,
                    places,
                    remaining,
                    truck.base_city if RNG.random() < 0.7 else None,
                    day_offset=-2,
                )
                db.flush()
                remaining -= order.quantity_tons
                orders.append(order)
            if not orders:
                continue

            trip = trip_service.create_trip(db, truck, orders)
            trip_service.start_trip(db, trip)
            _advance_trip_for_demo(db, trip, status, now)

    # --- planned (assigned but not dispatched) ----------------------------- #
    for truck in buckets[TruckStatus.ASSIGNED.value]:
        remaining = truck.capacity_tons * RNG.uniform(0.4, 0.9)
        orders = []
        for _ in range(RNG.choices([1, 2], weights=[6, 4])[0]):
            if remaining < 2:
                break
            seq += 1
            order = _make_order(db, seq, places, remaining, truck.base_city)
            db.flush()
            remaining -= order.quantity_tons
            orders.append(order)
        if orders:
            trip_service.create_trip(db, truck, orders)

    # --- idle fleet -------------------------------------------------------- #
    for truck in buckets[TruckStatus.AVAILABLE.value]:
        truck.status = TruckStatus.AVAILABLE.value
    for truck in buckets[TruckStatus.MAINTENANCE.value]:
        truck.status = TruckStatus.MAINTENANCE.value
        truck.notes = "Scheduled gearbox overhaul at authorised workshop."
        if truck.driver:
            truck.driver.status = DriverStatus.RESTING.value

    # --- a demo billing party with its own portal login -------------------- #
    account = PartyAccount(phone="9876543210", full_name="Nitin Agrawal")
    db.add(account)
    db.flush()
    portal_companies = [
        Company(
            account_id=account.id,
            name="ABC Industries",
            gst_number="24AAACA1234A1Z5",
            contact_person="Nitin Agrawal",
            address="Block C, Naroda GIDC, Ahmedabad - 382330",
        ),
        Company(
            account_id=account.id,
            name="ABC Steel Trading",
            gst_number="24AAACA9876B1Z2",
            contact_person="Rohan Agrawal",
            address="Shed 14, Odhav Ring Road, Ahmedabad - 382415",
        ),
    ]
    db.add_all(portal_companies)
    db.flush()

    # Orders this party placed itself. A few are then dispatched so the portal
    # demonstrates every stage it can show, not just "awaiting truck".
    portal_orders = []
    for index, company in enumerate(portal_companies * 3):
        seq += 1
        order = _make_order(db, seq, places, max_tons=18, day_offset=index - 2)
        order.source = OrderSource.PORTAL.value
        order.company_id = company.id
        order.placed_by_account_id = account.id
        order.billing_party = company.name
        portal_orders.append(order)
    db.flush()

    # --- unassigned backlog ------------------------------------------------ #
    # Mostly upcoming collections, with a few already overdue so the alert
    # rules have something to report.
    for index in range(38):
        seq += 1
        _make_order(db, seq, places, max_tons=30, day_offset=0 if index % 8 else -3)
    db.flush()

    # --- completed history ------------------------------------------------- #
    available = buckets[TruckStatus.AVAILABLE.value]
    for truck in RNG.sample(available, min(8, len(available))):
        days_ago = RNG.randint(1, 12)
        seq += 1
        order = _make_order(
            db, seq, places, truck.capacity_tons * 0.8, day_offset=-days_ago
        )
        db.flush()
        trip = trip_service.create_trip(db, truck, [order])
        trip_service.start_trip(db, trip)
        started = now - timedelta(days=days_ago)
        for stop in trip.stops:
            stop.status = StopStatus.COMPLETED.value
            stop.completed_at = started + timedelta(hours=stop.sequence * 3 + 2)
        trip_service.finish_trip(db, trip)
        trip.started_at = started
        trip.completed_at = started + timedelta(hours=len(trip.stops) * 3 + 2)
        truck.status = TruckStatus.AVAILABLE.value
        db.commit()

    # --- dispatch a few of the portal orders ------------------------------ #
    # Last, so the trucks picked here are not then reused by the history block
    # above: create_trip folds new orders into whatever trip a truck already
    # has open, which would quietly merge unrelated consignments.
    free = [
        t
        for t in trucks
        if t.driver
        and t.current_trip_id is None
        and t.status == TruckStatus.AVAILABLE.value
    ]
    used: set = set()
    for order, advance in zip(portal_orders, ("allocated", "in_transit", "delivered")):
        truck = next(
            (
                t
                for t in free
                if t.id not in used and t.capacity_tons >= order.quantity_tons
            ),
            None,
        )
        if truck is None:
            continue
        used.add(truck.id)

        trip = trip_service.create_trip(db, truck, [order])
        if advance == "allocated":
            continue
        trip_service.start_trip(db, trip)
        for stop in list(trip.stops)[: 1 if advance == "in_transit" else None]:
            trip_service.complete_stop(db, trip, stop)
        db.commit()

    # Fill both address books from the orders just created, the same way a
    # real order does -- the control room's own, and the demo party's.
    for order in db.scalars(select(TransportOrder)):
        owner = order.placed_by_account_id
        place_service.remember(
            db, order.pickup_name, order.pickup_phone, order.pickup_address, owner
        )
        place_service.remember(
            db, order.drop_name, order.drop_phone, order.drop_address, owner
        )
    db.commit()

    # Alerts reflect the seeded state straight away.
    from .services import alerts as alert_service

    alert_service.scan(db)
    db.commit()


def _advance_trip_for_demo(db: Session, trip: Trip, truck_status: str, now) -> None:
    """Close the first few stops of a freshly started trip."""
    stops = trip.stops
    if not stops:
        return

    if truck_status == TruckStatus.AT_PICKUP.value:
        # Parked at the first stop, nothing closed yet.
        completed = 0
    elif truck_status == TruckStatus.AT_DELIVERY.value:
        # Every pickup done, waiting to unload.
        completed = sum(1 for s in stops if s.stop_type == "pickup")
    else:
        completed = RNG.randint(0, max(len(stops) - 1, 0))

    for stop in stops[:completed]:
        stop.status = StopStatus.COMPLETED.value
        stop.completed_at = now - timedelta(hours=(completed - stop.sequence) * 2)
        for order in stop.orders:
            if stop.stop_type == "pickup":
                order.picked_up_at = stop.completed_at
                order.status = OrderStatus.IN_TRANSIT.value
            else:
                order.delivered_at = stop.completed_at
                order.status = OrderStatus.DELIVERED.value

    trip.progress_percent = round(completed / len(stops) * 100, 1)
    trip.started_at = now - timedelta(hours=RNG.randint(1, 9))
    trip.truck.status = truck_status
    db.commit()


def reset_schema() -> None:
    """Drop and recreate every table.

    SQLite enforces foreign keys per statement, so a plain ``drop_all`` fails
    on the dependency order. Disabling the pragma for the duration keeps this
    working identically on SQLite and PostgreSQL.
    """
    with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        Base.metadata.drop_all(bind=conn)
        if engine.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(bind=engine)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the fleet demo database")
    parser.add_argument(
        "--reset", action="store_true", help="drop and recreate all tables first"
    )
    args = parser.parse_args()

    if args.reset:
        reset_schema()
    else:
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.scalar(select(Truck.id)) is not None and not args.reset:
            print("Database already has trucks. Re-run with --reset to rebuild.")
            return
        seed(db)
        print(
            f"Seeded {len(list(db.scalars(select(Truck))))} trucks, "
            f"{len(list(db.scalars(select(TransportOrder))))} transport orders, "
            f"{len(list(db.scalars(select(Trip))))} trips."
        )
        print("Admin login:  admin@fleetops.in / admin123")
        print("Driver login: driver@fleetops.in / driver123")
        print("Party portal: 9876543210 / OTP 12345")
        demo = db.scalar(select(Driver).where(Driver.code == "DRV-0001"))
        if demo is not None:
            print(f"Driver app:   9000000001 / OTP 12345  ({demo.name})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
