from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, SessionLocal, engine, get_db
from .models import Truck
from .routers import (
    alerts,
    customers,
    assignment,
    auth,
    dashboard,
    driver_app,
    drivers,
    orders,
    portal,
    search,
    trips,
    trucks,
)
from .services import alerts as alert_service
from .services.capacity import CapacityError
from .services.realtime import hub

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("fleet")


async def _alert_loop() -> None:
    """Re-run the alert rules on a timer and push new alerts to dashboards."""
    interval = get_settings().alert_scan_seconds
    while True:
        await asyncio.sleep(interval)
        try:
            created = await asyncio.to_thread(_scan_once)
            for payload in created:
                await hub.broadcast("alert", payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Alert scan failed")


def _scan_once() -> list:
    db: Session = SessionLocal()
    try:
        return [
            {
                "id": alert.id,
                "kind": alert.kind,
                "severity": alert.severity,
                "title": alert.title,
                "message": alert.message,
                "truck_id": alert.truck_id,
                "order_id": alert.order_id,
                "trip_id": alert.trip_id,
                "created_at": alert.created_at,
            }
            for alert in alert_service.scan_quietly(db)
        ]
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    # Seed on an empty database so a fresh checkout boots with the full demo
    # fleet instead of an empty dashboard.
    db: Session = SessionLocal()
    try:
        if (db.scalar(select(func.count(Truck.id))) or 0) == 0:
            from .seed import seed

            log.info("Empty database detected - seeding demo fleet")
            seed(db)
    finally:
        db.close()

    task = asyncio.create_task(_alert_loop())
    log.info("Fleet backend ready")
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="Fleet & Transport Order Management API",
    version="2.0.0",
    description=(
        "Truck fleet, driver, transport-order and trip API for a "
        "single-operator logistics control room, a billing-party portal for "
        "placing and tracking orders, and a driver app for updating trip "
        "progress."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(CapacityError)
async def capacity_error_handler(_request, exc: CapacityError):
    return JSONResponse(status_code=422, content={"detail": exc.detail()})


for module in (
    auth,
    dashboard,
    trucks,
    drivers,
    orders,
    assignment,
    trips,
    alerts,
    search,
    portal,
    driver_app,
    customers,
):
    app.include_router(module.router)


system = APIRouter(prefix="/api/system", tags=["system"])


@system.get("/health")
def health(db: Session = Depends(get_db)):
    trucks_count = db.scalar(select(func.count(Truck.id))) or 0
    return {
        "status": "ok",
        "trucks": int(trucks_count),
        "websocket_clients": hub.client_count,
        "database": get_settings().database_url.split("://")[0],
    }


app.include_router(system)


@app.websocket("/ws/fleet")
async def fleet_socket(ws: WebSocket):
    """Live channel: assignments, trip events and alerts."""
    await hub.connect(ws)
    try:
        while True:
            # The client only needs to keep the socket alive; everything
            # flows server -> client.
            await ws.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(ws)
    except Exception:
        await hub.disconnect(ws)


# --------------------------------------------------------------------------- #
# The built frontend, served from this same service.
#
# One origin for the app and the API, which is what the frontend assumes: it
# calls "/api/..." with no host, so there is no CORS preflight and the
# WebSocket upgrade needs no separate origin. Mounted last, so every API route
# above wins; absent in development, where Vite serves the frontend itself.
# --------------------------------------------------------------------------- #
_DIST = (Path(__file__).resolve().parent.parent.parent / "frontend" / "dist").resolve()

if _DIST.is_dir():
    # Mounted before the catch-all below, because routes match in the order
    # they are added: StaticFiles sets the caching and range headers that a
    # hand-rolled FileResponse would not.
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    # ----------------------------------------------------------------- #
    # One link per audience.
    #
    # Three groups of people are given three different URLs, each landing on
    # the sign-in they need: the control room never sees the driver's screen,
    # and a driver handed /driver does not have to find it in a menu. They are
    # redirects rather than separate builds -- one app, one deploy, three
    # doors. The app routes on the fragment, so these server paths are free.
    # ----------------------------------------------------------------- #
    ENTRANCES = {
        "control": "/#/login",
        "control-room": "/#/login",
        "admin": "/#/login",
        "customer": "/#/portal/login",
        "portal": "/#/portal/login",
        "driver": "/#/driver/login",
    }

    @app.get("/{entrance}", include_in_schema=False)
    async def entrance(entrance: str):
        """Send a named entrance to its sign-in, or fall through to the app."""
        target = ENTRANCES.get(entrance.lower().strip("/"))
        if target is None:
            return await spa(entrance)
        return RedirectResponse(target, status_code=307)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        """Serve a built file, or index.html for anything else.

        The app routes on the URL fragment, so every path that is not a file
        is the same HTML document. The parent check keeps a "../" out of the
        path from reaching anything above the build directory.
        """
        candidate = (_DIST / full_path).resolve()
        if full_path and _DIST in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")

    log.info("Serving the built frontend from %s", _DIST)
else:
    log.info("No frontend build at %s - API only", _DIST)
