"""Application settings."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVICE_NAME: str = "submission-service"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://plaglens:plaglens@localhost:5432/submission"
    DATABASE_SCHEMA: str = "submission"

    REDIS_URL: str = "redis://localhost:6379/0"

    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_CONSUMER_GROUP: str = "submission-service"
    KAFKA_PUBLISH_PREFIX: str = "plaglens"

    JWT_PUBLIC_KEY_PATH: str | None = None
    JWT_PUBLIC_KEY: str | None = None
    JWT_ALGORITHM: str = "RS256"
    JWT_AUDIENCE: str = "plaglens"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minio"
    MINIO_SECRET_KEY: str = "minio12345"  # nosec B105
    MINIO_BUCKET_PREFIX: str = "plaglens"
    MINIO_BUCKET_PATTERN: str = "plaglens-{tenant_slug}"
    MINIO_SECURE: bool = False
    MINIO_REGION: str = "us-east-1"
    SIGNED_URL_EXPIRY_SECONDS: int = 600

    COURSE_SERVICE_URL: str = "http://course-service:8080"
    IDENTITY_SERVICE_URL: str = "http://identity-service:8080"

    MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024
    MAX_ARCHIVE_SIZE_BYTES: int = 50 * 1024 * 1024

    IDEMPOTENCY_TTL_SECONDS: int = 24 * 3600

    AUTH_DISABLED: bool = Field(default=False, description="Disable JWT for local/test runs")
    KAFKA_DISABLED: bool = Field(default=False, description="Disable Kafka for local/test runs")
    MINIO_DISABLED: bool = Field(default=False, description="Use in-memory storage stub")


@lru_cache
def get_settings() -> Settings:
    return Settings()
