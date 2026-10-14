import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalise_database_url(raw: str) -> str:
    """Accept the URL a hosted Postgres hands out, whatever its spelling.

    Neon, Render and Heroku all print ``postgres://`` or ``postgresql://``,
    but SQLAlchemy needs the driver named -- without it, it reaches for
    psycopg2, which is not installed. The query string is left alone, so
    Neon's ``sslmode=require`` and channel binding still apply.
    """
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://") :]
    return raw


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres-first. Falls back to a local SQLite file so the demo runs with
    # zero infrastructure. Example Postgres URL:
    #   postgresql+psycopg://fleet:fleet@localhost:5432/fleet
    database_url: str = "sqlite+pysqlite:///./fleet.db"
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 12

    # How often the background task re-runs the alert rules, in seconds.
    alert_scan_seconds: float = float(os.getenv("ALERT_SCAN_SECONDS", "60"))

    # ----------------------------------------------------------------- #
    # Billing-party portal OTP.
    #
    # DEVELOPMENT PLACEHOLDER. Every mobile number accepts this one code,
    # which means anyone who guesses a phone number can sign in as that
    # party and read their orders. It exists only so the portal can be
    # demonstrated without an SMS gateway.
    #
    # Before this is exposed to real users: generate a random code per
    # request, store it with a short expiry and an attempt counter, deliver
    # it over SMS, and set PORTAL_OTP_FIXED to an empty value so this path
    # is disabled.
    # ----------------------------------------------------------------- #
    portal_otp_fixed: str = os.getenv("PORTAL_OTP_FIXED", "12345")
    portal_token_ttl_minutes: int = 60 * 24 * 7

    # A validator rather than a default, because pydantic-settings reads
    # DATABASE_URL into the field itself -- a normalised default would only
    # apply when the variable is absent, which is never the case in
    # production.
    _normalise = field_validator("database_url")(
        lambda value: _normalise_database_url(value)
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
