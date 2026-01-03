"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    service_name: str = "course-service"
    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = Field(
        default="postgresql+asyncpg://localhost/plaglens_course",
        description="SQLAlchemy async DSN.",
    )

    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = False

    kafka_brokers: str = "localhost:9092"
    kafka_enabled: bool = False
    kafka_topic_course: str = "plaglens.course.course.v1"
    kafka_topic_assignment: str = "plaglens.course.assignment.v1"
    kafka_consumer_group: str = "course-service"
    kafka_subscribed_topics: tuple[str, ...] = (
        "plaglens.identity.user.v1",
        "plaglens.identity.tenant.v1",
    )

    jwt_public_key_path: str = ""
    jwt_hs_secret: str = "dev-secret"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "plaglens-identity"
    jwt_audience: str = "plaglens"

    integration_service_url: str = "http://integration:8000"
    submission_service_url: str = "http://submission:8000"
    plagiarism_service_url: str = "http://plagiarism:8000"
    ai_service_url: str = "http://ai:8000"
    http_client_timeout_s: float = 5.0

    cors_origins: tuple[str, ...] = ()


@lru_cache
def get_settings() -> Settings:
    return Settings()
