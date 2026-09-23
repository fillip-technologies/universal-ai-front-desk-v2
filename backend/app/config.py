"""Central settings, loaded from environment / .env. All other modules import
`settings` from here rather than reading os.environ directly."""
from functools import lru_cache
from urllib.parse import quote

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database (PostgreSQL) ────────────────────────────────────────────────
    # Two ways to configure, checked in this order:
    #
    #   1. DATABASE_URL — a full connection string. Use this for hosted
    #      providers that hand you one. Plain `postgresql://` and `postgres://`
    #      forms are normalized to the asyncpg driver.
    #   2. POSTGRES_* components — user/password/host/port/db supplied
    #      separately and assembled here, with the credentials percent-encoded.
    #
    # Components are the safer option, and what docker-compose uses: assembling
    # the URL in YAML breaks the moment a password contains '@', '/', ':' or
    # '+', which strong generated passwords routinely do.
    database_url: str = ""
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "jansunwayi"
    db_echo: bool = False

    # Auth
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_days: int = 7

    admin_email: str = "admin@jansunwayi.gov.in"
    admin_password: str = "change-me-immediately"

    # Gemini
    gemini_api_key: str = ""

    # Twilio — SMS delivery of Aadhaar e-KYC OTPs only
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # ── Auto-escalation background job ───────────────────────────────────────
    # Sweep interval; the 48h inaction threshold itself lives in bihar_data (department reference data).
    escalation_sweep_minutes: int = 15
    escalation_enabled: bool = True

    # ── Demo toggle ─────────────────────────────────────────────────────────
    # When true, the Aadhaar e-KYC step accepts ANY 12-digit number — the UIDAI
    # Verhoeff checksum and the "cannot start with 0/1" rule are skipped, and
    # the OTP request rate limit is loosened. This is the demo default while the
    # real UIDAI integration is pending; set AADHAAR_RELAXED_VALIDATION=false to
    # restore genuine structural validation before any real deployment.
    aadhaar_relaxed_validation: bool = True

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def async_database_url(self) -> str:
        """The asyncpg connection URL, from DATABASE_URL or POSTGRES_* parts."""
        url = self.database_url.strip()
        if url:
            if url.startswith("postgres://"):
                url = "postgresql+asyncpg://" + url[len("postgres://"):]
            elif url.startswith("postgresql://"):
                url = "postgresql+asyncpg://" + url[len("postgresql://"):]
            return url

        # `safe=""` so '@', '/', ':' and '+' in the credentials are encoded
        # rather than being parsed as URL delimiters.
        user = quote(self.postgres_user, safe="")
        password = quote(self.postgres_password, safe="")
        return (
            f"postgresql+asyncpg://{user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
