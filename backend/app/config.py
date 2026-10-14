import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres-first. Falls back to a local SQLite file so the demo runs with
    # zero infrastructure. Example Postgres URL:
    #   postgresql+psycopg://fleet:fleet@localhost:5432/fleet
    database_url: str = os.getenv("DATABASE_URL", "sqlite+pysqlite:///./fleet.db")
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
