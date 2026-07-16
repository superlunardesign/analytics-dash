from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # General
    environment: str = "development"
    app_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:5173"
    secret_key: str = "change-me-in-production"

    # Database
    database_url: str = "sqlite:///./dev.db"

    @field_validator("database_url")
    @classmethod
    def _normalize_postgres_scheme(cls, v: str) -> str:
        # Render (like Heroku) hands out connection strings using the old
        # "postgres://" scheme, which SQLAlchemy 2.0 refuses to load a
        # dialect for. Normalize it here so every consumer of Settings --
        # the app, Alembic -- gets a URL that actually works.
        if v.startswith("postgres://"):
            return "postgresql://" + v[len("postgres://") :]
        return v

    # Meta / Instagram Graph API (Business Login)
    # Create these at https://developers.facebook.com/apps
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_graph_api_version: str = "v22.0"
    # Must exactly match a "Valid OAuth Redirect URI" configured on the Meta app.
    instagram_redirect_uri: str = "http://localhost:8000/api/instagram/oauth/callback"

    # Fernet key used to encrypt stored OAuth tokens at rest.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    token_encryption_key: str = ""

    # Sync behavior
    instagram_sync_lookback_days: int = 3650

    # Wix custom app (Site Analytics + Forms correlation)
    # Create at https://manage.wix.com/account/custom-apps
    wix_app_id: str = ""
    wix_app_secret: str = ""
    # The public key shown on the app's Webhooks page, used to verify
    # that incoming webhook JWTs actually came from Wix.
    wix_webhook_public_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
