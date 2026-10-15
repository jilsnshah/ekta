from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_indexes() -> list:
    """Create any index the models declare that the database is missing.

    ``Base.metadata.create_all`` only creates whole tables: an index added to
    a model that already has a table is simply never created, which is silent
    and only shows up later as a slow query. This project has no migration
    tool, so the gap is closed here instead -- it runs on every boot, creates
    only what is absent, and returns what it added.

    Note for a large table: this takes a brief lock. Postgres can build an
    index CONCURRENTLY without one, but that cannot run inside a transaction,
    so it is a deliberate manual step rather than something done at startup.
    """
    created = []
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            try:
                index.create(bind=engine, checkfirst=True)
            except Exception:
                # A concurrent boot may have just created it; the next call
                # finds it present.
                continue
            created.append(index.name)
    return created
