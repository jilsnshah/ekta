# FleetOps — Truck Fleet & Transport Order Management

Three applications on one backend, one for each person in the chain:

- a **control room** where one operator sees a 72-truck fleet on a single
  screen and assigns transport orders under a hard capacity rule,
- a **customer portal** where a billing party registers their companies,
  places orders and tracks them, and
- a **driver app** where the driver sees the trip their truck is on and closes
  each stop as they complete it.

The driver's taps are the source of truth for progress: closing a stop is what
moves an order on for the control room and the customer alike.

```
     billing party                control room                 driver
   places an order    ──►    allocates a truck    ──►    collects & delivers
          ▲                          ▲                          │
          └──────────── both read the driver's updates ◄─────────┘
```

The system is built around one relationship:

```
Driver 1 ─── 1 Truck ─── N TransportOrders ─── grouped into Trips
```

There is no GPS and no map. A truck's position is not tracked; a trip advances
when the operator closes each stop.

An order records a **billing party**, a **material**, a **weight in tons**, a
**pickup date**, and a pickup and drop place each given as **name, phone and
full address**. All of those are typed in -- there is no customer or location
master list -- and there is no delivery deadline.

**Stack:** FastAPI · SQLAlchemy 2 · PostgreSQL (SQLite fallback) · React 18 ·
TypeScript · Vite · Tailwind CSS 4 · WebSockets · JWT auth

---

## Quick start

```bash
./setup.sh      # virtualenv, npm install, seed 72 trucks + drivers + orders + trips
./dev.sh        # API on :8000, web app on :5173
```

Open <http://localhost:5173>.

Control room — <http://localhost:5173/#/login>

| Role   | Email                | Password    |
| ------ | -------------------- | ----------- |
| Admin  | `admin@fleetops.in`  | `admin123`  |
| Driver | `driver@fleetops.in` | `driver123` |

Customer portal — <http://localhost:5173/#/portal/login>

| Mobile       | OTP     |
| ------------ | ------- |
| `9876543210` | `12345` |

Any other 10-digit number also works and creates a fresh account on first
sign-in.

Driver app — <http://localhost:5173/#/driver/login>

| Mobile       | OTP     |
| ------------ | ------- |
| `9000000001` | `12345` |

That driver starts the demo already part-way through a trip. Only numbers on a
driver record can sign in; unlike the portal, the driver app never creates an
account. API docs: <http://localhost:8000/docs>

### Running the pieces separately

```bash
# Backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m app.seed --reset        # build the demo fleet
.venv/bin/python -m uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

The backend auto-seeds on first boot if the database is empty, so
`uvicorn app.main:app` alone is enough for a cold start.

---

## Configuration

See `backend/.env.example` and `frontend/.env.example`.

| Variable             | Default                         | Purpose |
| -------------------- | ------------------------------- | ------- |
| `DATABASE_URL`       | `sqlite+pysqlite:///./fleet.db` | Set to `postgresql+psycopg://user:pass@host:5432/fleet` for PostgreSQL. The schema is identical either way. |
| `JWT_SECRET`         | `dev-secret-change-me`          | **Change this before any real deployment.** |
| `ALERT_SCAN_SECONDS` | `60`                            | How often the background task re-runs the alert rules. |
| `PORTAL_OTP_FIXED`   | `12345`                         | The development OTP accepted by **both** the portal and the driver app. **Set it empty to disable OTP sign-in**; see the portal section. |
| `VITE_API_TARGET`    | `http://localhost:8000`         | Backend the dev server proxies `/api` and `/ws` to. |

### Using PostgreSQL

```bash
createdb fleet
export DATABASE_URL="postgresql+psycopg://$USER@localhost:5432/fleet"
cd backend && .venv/bin/python -m app.seed --reset
```

Tables are created from the SQLAlchemy metadata on startup. For a long-lived
deployment, put Alembic in front of that instead.

---

## What the screens do

| Screen | Purpose |
| ------ | ------- |
| **Dashboard** | Fleet and order KPIs, the two work queues (orders needing a truck soonest, open alerts), and the filterable 72-truck table. Every KPI tile is a one-click filter on the table. |
| **Assign Orders** | The core workflow. Drag unassigned orders onto trucks; the capacity arithmetic and the planned stop list appear before you commit. |
| **Transport Orders** | Every order with status filters, creation, cancellation and unassignment. Both places are typed in full; names already used autocomplete and fill in their phone and address. |
| **Trips** | All trips with stop progress. |
| **Trip Detail** | The stop timeline with manual reordering and per-stop completion, the load composition, the truck and driver, and the order manifest. |
| **Trucks / Drivers** | CRUD, driver assignment, trip history, vehicle records. |
| **Addresses** | Every saved pickup and delivery point: the control room's own book plus each customer's, searchable and filterable by owner. |
| **Alerts** | Capacity breaches, overdue pickups, trucks flagged delayed, trucks carrying load with no driver, and orders stuck in the backlog. |

Global search (`⌘K` / `Ctrl-K`) resolves truck numbers, driver names and
phones, order codes, the party's own order numbers, billing parties, place
names and trip codes.

### Customer portal

| Screen | Purpose |
| ------ | ------- |
| **My orders** | Four progress figures and every order the party has placed. A card list on a phone, a table from `md` up. |
| **Place an order** | The consignment form, with the billing party chosen from their own companies. |
| **Order tracking** | Four-step progress, the allocated truck and driver with a one-tap call button, and the party's own two legs. |
| **Saved addresses** | The godowns and delivery points kept for reuse. Fills itself. |
| **My companies** | Add, edit and remove the companies orders are billed to. |

### Driver app

| Screen | Purpose |
| ------ | ------- |
| **My trip** | The next stop in full, the run ahead, start-trip and report-delay. |
| **Past trips** | Trips this driver has run. |

### Responsive behaviour

Both audiences work on a phone and on a desktop, but they are not the same
problem, so they are not solved the same way.

The **portal** is used mostly from a phone. Navigation is a bottom tab bar
below `sm` and a top bar above it; the order list renders as cards below `md`
and as a table above; the stage tracker is a vertical rail on a phone and a
horizontal bar on a desktop; and the call-the-driver and cancel actions are
full-width buttons on a phone.

The **driver app** is phone-only in practice, so its column is capped at
phone width even on a desktop -- a 1400px-wide trip sheet helps nobody -- with
a two-tab bottom bar and 48-56px action buttons.

The **control room** is a dense, desktop-first tool -- its tables are meant to
be scanned on a wide screen. It stays usable on a phone (the sidebar becomes a
slide-over and tables scroll horizontally) but it is not optimised for one.

Shared controls carry the touch sizing: inputs and primary buttons are 44px on
a phone and revert to 36px from `sm` up, and inputs use a 16px font below `sm`
so iOS does not zoom on focus.

---

## The customer portal

A billing party is a customer, not a member of staff, so the portal is a
separate audience with its own sign-in, its own token and its own screens.

**Signing in.** A party enters a mobile number and a one-time code. The
account is created on first successful verification -- there is no sign-up
step. Numbers are normalised to ten digits, so `+91 98765-43210` and
`9876543210` are one account.

> **The OTP is a fixed development code (`12345`) for every number.** Anyone
> who guesses a phone number can sign in as that party and read their orders.
> It exists so the portal can be demonstrated without an SMS gateway. See
> `Settings.portal_otp_fixed`: before real users touch this, generate a random
> code per request, store it with a short expiry and an attempt counter,
> deliver it over SMS, and set `PORTAL_OTP_FIXED=` empty to disable this path.

**Companies.** A party adds one or more companies. Each order is billed to one
of them, and the chosen name is copied onto the order, so renaming a company
later does not rewrite order history. A company with orders on file cannot be
deleted.

**Placing an order.** Five short steps, one question per screen: who to bill,
where to pick up, where to deliver, what the goods are, then a review. A
progress bar names the current step, every step can be revisited from the
review, and *Continue* stays disabled with a line of plain text saying what is
missing.

Two things exist because a first-time customer has no idea what the system
expects of them:

- **A company is created inside the flow.** Step one offers an *Add company*
  form in place, so nobody is sent to another screen to find out what a
  "company" is. The earlier version dead-ended here.
- **Addresses are chosen, not retyped.** Step two and three list the saved
  places first; typing a new one is one tap away and saves itself.

The first visit shows a three-step explanation of what happens next instead of
an empty table.

The order lands in the control room's backlog immediately, tagged
`source: "portal"`, and a WebSocket event nudges any open dashboard.

**Words.** A customer is not an operator, so the portal says *billed to* rather
than "billing party", *goods* rather than "consignment", *waiting for a truck*
rather than "unassigned", and *we are arranging a truck* rather than a status
code.

**Tracking.** The party sees a four-step view -- *Order placed → Truck
allocated → In transit → Delivered* -- rather than the eight internal
statuses, plus the allocated truck, the driver's name and a one-tap call
button, and its own two legs ticking off as the driver completes them. An
order can be withdrawn while it is still waiting for a truck; after that the
portal tells them to call the control room.

---

## The address book

A godown is typed once. From then on it is offered back.

`saved_places` rows belong either to a billing-party account or, when
`account_id` is `NULL`, to the control room. **Nothing is maintained by hand**:
`places.remember()` runs whenever an order is raised, from either side, so the
book is a by-product of ordinary use. Placing an order saves both its pickup
and its drop.

Entries are matched on a normalised `label|address` -- lowercased, punctuation
and repeated whitespace stripped -- so "Plot 9, Sanand GIDC" typed sloppily the
second time bumps the existing entry's `use_count` instead of adding a
near-duplicate. The book is served most-used first, which puts the usual
suspects at the top.

**Who sees what.** A customer sees only their own book, at
`/api/portal/places`, and can tidy it (rename, fix a typo, remove). The control
room's `/api/orders/places` returns its own entries first and then *every*
customer's, each labelled with whose it is -- staff raise orders on the phone
for godowns the customer has already saved. Those customer entries are
**read-only to the control room**: an address book belongs to its owner, and
editing it behind their back would be a surprise.

Removing an entry never changes an order. Orders keep their own copy of the
address, so history stays truthful.

---

### Isolation

A trip carries several parties' consignments, which is the main leak risk
here. Three rules enforce the boundary, each covered by a test:

1. Every portal endpoint is scoped by `placed_by_account_id`. Another party's
   order id reads as **404, not 403**, so the portal never confirms an id
   exists.
2. `portal.PortalStopOut` returns **only the stops that handle the requesting
   party's order**, renumbered from 1 -- the trip's own sequence would reveal
   how many other stops exist, and the stop list would otherwise expose
   another party's addresses.
3. The two audiences refuse each other's tokens outright: `current_party`
   rejects anything whose role is not `party`, and `current_user` rejects a
   party token rather than relying on a failed lookup.

---

## The driver app

Used one-handed, in a cab, often in sunlight. So the screen answers one
question at a time.

**What the driver gets.** The next stop is the whole screen: what to do there
(`COLLECT` / `DELIVER`), the place name, the full address, an *Open in Maps*
link and a *Call site* button, the manifest of consignments to load or hand
over -- order code, material, weight and billing party, so the right goods go
to the right place -- and the weight that will be on board afterwards against
the truck's capacity. Below that, the whole run with completed stops ticked,
and their past trips on a second tab.

**What they do.** Start the trip when they set off, close each stop as they
finish it, and report a delay with a reason. Stops close in order, and the
confirmation dialog repeats the manifest before committing, because the driver
cannot undo it from the app.

**What they do not get.** Other trucks, other drivers, the assignment board,
dashboards, alerts, or anything belonging to another trip.

A delay report sets the truck to `delayed` and raises a
`driver_reported_delay` alert naming the reason, so the control room hears it
from the person who actually knows. One open report per driver per trip, so
repeated taps do not pile up.

### Isolation

The same three rules as the portal, with one difference: a driver account is
created by the control room, so `POST /api/driver/auth/verify` **refuses an
unknown number** rather than registering it. Trips are resolved through the
driver's own truck, so another driver's trip id reads as 404 and a stop on it
cannot be closed. All three audiences refuse each other's tokens.

Closing a stop is idempotent -- a double tap on a patchy signal returns the
same state rather than an error.

---

## The capacity rule

The system's central invariant:

```
SUM(quantity_tons of load-bearing orders on a truck) <= truck.capacity_tons
```

"Load-bearing" means an order in `assigned`, `pickup_pending`, `picked_up` or
`in_transit`. Delivery or cancellation releases the weight.

It is enforced in three places:

1. **`app/services/capacity.py`** is the only authority. Every assignment path
   routes through `validate_assignment`, which raises `CapacityError` carrying
   the exact arithmetic (capacity, current load, requested, overflow).
2. **`POST /api/assignment/preview`** runs the same check without writing, so
   the assignment board shows the result before the operator commits.
3. **The frontend** mirrors the arithmetic for instant feedback, and it is
   advisory only — the server decides.

The spec's example, verified by both a unit test and an API test: a 20 T truck
already holding 8 T + 7 T refuses a third 6 T order with
`422 capacity_exceeded` and `overflow_tons: 1.0`.

Related guards: a truck's capacity cannot be edited below its current load; an
order's quantity cannot be raised past its truck's headroom; a picked-up order
cannot be unassigned; a truck with no driver cannot open a trip.

---

## Stop sequencing

`app/services/sequencing.py` turns a set of orders into a stop sequence.

Each order becomes two *tasks* -- a pickup and a delivery -- under two hard
constraints: a delivery never precedes its pickup, and the load on board never
exceeds capacity at any point in the sequence.

With no geography and no delivery deadline there is nothing to optimise
against, so the default order is deliberately plain and explainable:

1. Collect in **pickup date** order.
2. Deliver in the order things were collected.
3. Pull a delivery forward whenever the next collection would otherwise
   overload the truck.
4. A drop at the address the truck is already standing at goes first.

Consecutive tasks at the same place merge into one physical stop. Because
addresses are typed by hand, two stops are considered the same place after
normalising -- lowercased, punctuation and repeated whitespace removed -- so
"Plot 9, Sanand GIDC" and "plot 9  sanand gidc" are one visit.

The operator can override the result by dragging stops, or with the up/down
controls on each row. `plan_from_manual_order` re-validates both constraints
and rejects an illegal sequence with a readable message; the frontend mirrors
the same check so a bad arrangement is explained before it is saved.

Completed stops are a locked prefix. They keep their row, their position and
their timestamp through any re-plan or reorder, and moving one is refused --
otherwise re-planning a live trip would erase the record of what the driver
has already done.

## Paging

Every list is paged by the server. Nothing in the UI loads a whole table: at a
lakh of orders that is neither a page the browser can draw nor a query the
database should be asked for.

**The envelope.** Every list endpoint returns the same shape, from
`app/pagination.py`:

```json
{ "items": [...], "total": 1284, "page": 2, "page_size": 25,
  "pages": 52, "has_next": true, "has_previous": true }
```

`page` and `page_size` are query parameters, with `page_size` capped at 200 --
asking for more is a 422 rather than a slow success.

**Searching and filtering happen in SQL, never on the page in hand.** This is
the rule the whole design turns on. A filter applied to the 25 rows already
fetched looks like it works and quietly misses every match on the other
fifty-one pages. So `?search=`, the status filters, `min_capacity`,
`without_driver`, `has_available_capacity`, `with_pending_orders` and the sort
column are all parameters, resolved before the `LIMIT`. The capacity filters in
particular are correlated subqueries rather than Python:

```python
load_on_board = (
    select(func.coalesce(func.sum(TransportOrder.quantity_tons), 0.0))
    .where(TransportOrder.truck_id == Truck.id)
    .where(TransportOrder.status.in_(LOAD_BEARING_VALUES))
    .correlate(Truck).scalar_subquery()
)
stmt = stmt.where(load_on_board < Truck.capacity_tons)   # "has room"
```

**Counts come from the server, not from the rows on screen.** A filter chip
reading "Available 21" has to mean 21 trucks in the fleet, not 21 on this page,
so each list that shows counts has a companion endpoint that groups in SQL:
`/api/drivers/stats`, `/api/orders/stats`, `/api/trips/stats`,
`/api/driver/trips/stats`, and the existing `/api/dashboard` for the fleet. The
order and trip ones deliberately ignore the status filter -- a chip must show
what selecting it *would* find -- while still honouring search, which bounds
what the user is looking at.

**The frontend side** is one hook, `src/lib/usePaged.ts`:

```ts
const list = usePaged({
  key: ['trucks'],
  filters: truckQuery(filter),          // sent to the server
  fetchPage: (params) => api.trucks(params),
})
```

It resets to page 1 whenever the filter fingerprint changes (staying on page 7
of a different result set is meaningless) and uses `keepPreviousData` so paging
does not flash an empty table. `<Pagination>` renders "Showing 26-50 of 1,284"
with a per-page selector.

**The assignment board** pages its two halves independently -- `page`/`page_size`
for the backlog, `truck_page`/`truck_page_size` for the fleet -- because either
side could be thousands of rows and the board is useless if it must load both
before drawing. Orders selected on one page stay selected across pages: the
board keeps what it has seen so a selection's tonnage is still right when it is
dropped on a truck three pages later.

**The address pickers** search the book on the server too. A customer with a
thousand godowns gets the ones they use most, with a search box that reaches
the rest -- rather than a picker whose list silently stops at its first page.

---

## Live updates

There is no position tracking, but the dashboard still reacts to other
operators' work. The server broadcasts assignment, trip and alert events over
`/ws/fleet`; the frontend (`src/lib/live.tsx`) keeps one socket with
exponential-backoff reconnect and turns each event into a debounced React Query
invalidation. A background task re-runs the alert rules every
`ALERT_SCAN_SECONDS` and pushes anything new down the same channel.

---

## Data model

```
Driver 1 ─── 1 Truck            (unique Truck.driver_id enforces it)
Truck  1 ─── N TransportOrder
Truck  1 ─── N Trip
Trip   1 ─── N TransportOrder
Trip   1 ─── N TripStop
TripStop N ── N TransportOrder   (one stop can serve several orders)

PartyAccount 1 ─── N Company     (the portal's own login)
PartyAccount 1 ─── N TransportOrder   (placed_by_account_id)
Company      1 ─── N TransportOrder   (company_id)
PartyAccount 1 ─── N SavedPlace       (account_id NULL = control room's own)
```

An order carries `source` (`admin` or `portal`). A portal order also points at
the company it is billed to and the account that raised it, while keeping its
own copy of the billing-party name.

The driver app needs no new tables: a driver signs in against the `drivers`
record the control room already created, matched on the phone number it holds.

There are no `customers` or `locations` tables. The billing party and both
places live on the order as text, because dispatch takes orders over the phone
for sites that are not on any master list. `/api/orders/billing-parties` and
`/api/orders/places` return the distinct values already on file, which is what
the form's autocomplete offers back.

A `TripStop` copies its place onto itself when the trip is planned, so editing
an order later cannot rewrite the history of where the driver went.

Enums are stored as short strings, so the schema is portable between SQLite and
PostgreSQL with no native-ENUM migration. `trucks.current_trip_id` and
`trips.truck_id` form a deliberate cycle (`use_alter=True`) so a truck can
point at its active trip.

### Truck statuses

`available`, `assigned`, `in_transit`, `at_pickup`, `at_delivery`, `delayed`,
`maintenance`.

`assigned` and `in_transit` are set by the assignment and trip lifecycle. The
rest are set by the operator, who is the one talking to the driver —
`POST /api/trucks/{id}/status` refuses the lifecycle-owned ones, and refuses to
mark a truck available while it is on an active trip.

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests -q     # 113 tests
```

Coverage focuses on the rules that must not break: the capacity invariant
including the spec's 8+7+6 > 20 case, pickup-before-delivery precedence,
capacity feasibility across a sequence, manual-reorder rejection (illegal
precedence and an overloaded sequence), completed stops surviving a reorder or
re-plan, refusing to move a completed stop, the full assign → dispatch →
pickup → deliver → truck-available lifecycle, out-of-order stop completion,
one-driver-one-truck, operator-settable statuses, order creation with typed
parties and addresses, stops merging on a typed address, and the
pickup-overdue alert rule.

`tests/test_portal.py` covers the portal end to end: OTP sign-in and account
creation, number normalisation, duplicate company names, placing an order and
seeing it in the control room, the truck and driver appearing once allocated,
progress as stops close, withdrawal limits -- and the isolation rules, including
two parties sharing one truck where each must see only its own two legs.

`tests/test_driver_app.py` covers the driver app: sign-in against a fleet
record, an unknown number never creating a driver, the assigned trip with its
per-stop running load, start-then-close ordering, idempotent closes, a
completed run freeing the truck, a delay report reaching the control room's
alerts -- and one test that follows a single order from the portal, through the
driver's taps, to the stage the billing party sees.

The address book is covered too: both addresses saved on order placement, a
sloppily retyped address bumping the existing entry rather than duplicating it,
one party's book being invisible and unwritable to another, the control room
seeing every book but unable to edit a customer's, removing an entry leaving
past orders untouched, and `remember` deduping within a single transaction --
the session runs with autoflush off, so that last one needs an explicit flush
and silently inserted 288 rows for 43 places before it had one.

`tests/test_pagination.py` covers the paging contract itself: the envelope's
shape, a walk that must see every row exactly once and no row twice, the flags
on the last page, a page past the end, the `page_size` cap, a search that
reaches rows beyond page 1, a status filter counted over the whole table rather
than the page, sorting applied before the limit, the capacity filters resolved
in SQL, a parametrised check that *every* staff list is paged, the board paging
both halves, and the `/stats` endpoints -- including one test that they are
declared before the `/{id}` routes, since otherwise `/stats` parses as an id.

```bash
cd frontend && npm run typecheck && npm run build
node scripts/render-check.mjs    # renders all 22 pages against fixtures
```

`render-check.mjs` server-renders every page through the real router with the
React Query cache pre-seeded, and asserts a marker string from the fixtures --
so a page that silently falls back to a spinner fails rather than passing. It
runs each audience under its own session -- staff, party, then driver -- since
every audience's routes redirect the other two away.

---

## Project layout

```
backend/
  app/
    main.py          FastAPI app, lifespan, alert loop, WebSocket endpoint
    models.py        SQLAlchemy models and enums
    schemas.py       Pydantic request/response models
    serializers.py   ORM → response mapping (one shape per entity)
    security.py      staff JWT, bcrypt, role dependencies
    portal_security.py  party JWT, phone normalisation, OTP check
    driver_security.py  driver JWT, phone matching against fleet records
    clock.py         single source of naive-UTC "now"
    pagination.py    Page envelope, PageParams, paginate() -- used by every list
    seed.py          demo fleet generator (python -m app.seed --reset)
    routers/         auth, trucks, drivers, orders, assignment, trips,
                     dashboard, alerts, search, portal, driver_app
    services/
      capacity.py    the capacity invariant
      sequencing.py  pickup/delivery ordering and stop merging
      places.py      the shared address book; remember() fills it
      portal.py      party-safe order views (scoping lives here)
      driver_app.py  driver-shaped trip views, running load per stop
      trips.py       trip lifecycle
      alerts.py      alert rules
      realtime.py    WebSocket fan-out
  tests/

frontend/src/
  lib/       api client, types, auth, live socket, formatters, status
             palette, stage mapping, sequence validator, link helpers,
             paging (Page type) and usePaged (one paged list's state)
  components/ui, shell, portalShell, driverShell, truckTable, toast,
             alertItem, sortable, placePicker
  pages/     Dashboard, Assign, Orders, OrderDetail, Trips, TripDetail,
             Trucks, TruckDetail, Drivers, DriverDetail, Places, Alerts
  pages/portal/  Login, Orders, NewOrder (the step-by-step flow),
                 OrderDetail, Addresses, Companies
  pages/driver/  Login, Today, History
```

---

## Demo data

`python -m app.seed --reset` builds a deterministic fleet:

- 72 trucks (`GJ01AB1001`–`GJ01AB1072`), capacities 9–35 T, each with one driver
- 72 drivers with phones, licences and expiry dates
- ~141 transport orders across 18 billing parties and 43 typed-in places in
  Gujarat and neighbouring states, roughly half quoting the party's own order
  number
- 49 trips part-way through their stops, 10 planned, plus completed history
- Status spread: 12 available, 33 in transit, 8 at pickup, 5 at delivery,
  3 delayed, 1 in maintenance, 10 assigned
- One portal account (`9876543210`) with two companies and six orders it
  placed itself, spread across the stages it will see
- A demo driver (`9000000001`) whose truck is already part-way through a trip,
  so the driver app has something to do on first sign-in
- Both address books pre-filled from those orders: 43 control-room entries and
  12 belonging to the demo customer, with real use counts

To see the first-time customer experience, sign in to the portal with any
unused 10-digit number -- that account starts with no companies, no addresses
and no orders.

---

## Notes and limits

- **No vehicle tracking.** Trips advance only when the operator closes a stop.
  If live positions are wanted later, the natural seam is a new
  `tracking` service plus a `positions` table — nothing in the current model
  assumes coordinates.
- **Sequencing is date-driven, not distance-driven.** Without geography the
  sequencer cannot minimise kilometres; it collects in pickup-date order and
  honours the two hard constraints. Adding a distance matrix would make
  `sequencing.plan` a true route optimiser without changing its callers.
- **Free-text places have no referential integrity.** Two spellings of the same
  warehouse are two places, and only the normalised comparison in
  `sequencing.Place.key` pulls them back together for stop merging. If the
  operation later wants a managed site list, the seam is that helper plus the
  `/api/orders/places` suggestions.
- **Schema creation** runs from SQLAlchemy metadata. Add Alembic before you
  need to migrate production data.
- **CORS** is wide open for local development. Restrict `allow_origins` in
  `main.py` before deploying.
- **The OTP is not real authentication**, for either the portal or the driver
  app -- both share `PORTAL_OTP_FIXED`. It is the single thing that must change
  before anyone outside the office is given a link. See the portal section.
