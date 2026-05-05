"""Settings for the plagiarism service.

All values are env-driven via pydantic-settings. Tenant-scoped provider configs
live in the DB (`provider_configs`); env vars only carry process-global
defaults / credentials shared across the deployment.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ----- runtime -----
    service_name: str = "plagiarism-service"
    env: Literal["dev", "staging", "prod", "test"] = "dev"
    log_level: str = "INFO"

    # ----- database -----
    database_url: str = (
        "postgresql+asyncpg://plaglens:plaglens@localhost:5432/plagiarism"
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_schema: str = "plagiarism"

    # ----- redis -----
    redis_url: str = "redis://localhost:6379/0"
    redis_idempotency_ttl_seconds: int = 24 * 3600

    # ----- kafka -----
    kafka_bootstrap: str = "localhost:9092"
    kafka_consumer_group: str = "plagiarism-service"
    kafka_topic_run: str = "plaglens.plagiarism.run.v1"
    kafka_topic_submission: str = "plaglens.submission.submission.v1"
    kafka_topic_assignment: str = "plaglens.course.assignment.v1"
    kafka_topic_integration_import: str = "plaglens.integration.import.v1"
    kafka_topic_identity_user: str = "plaglens.identity.user.v1"

    # ----- minio / s3 -----
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    minio_bucket_prefix: str = "plaglens"
    minio_signed_url_ttl_seconds: int = 5 * 60

    # ----- celery -----
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    celery_default_queue: str = "plagiarism"

    # ----- jwt / auth -----
    jwt_public_key: str = ""
    jwt_algorithm: str = "RS256"
    jwt_audience: str = "plaglens-api"
    jwt_issuer: str = "plaglens-identity"
    auth_required: bool = True

    # ----- providers -----
    default_provider: str = "jplag"
    jplag_jar_path: str = "/opt/jplag.jar"
    jplag_java_bin: str = "java"
    jplag_min_tokens: int = 9
    jplag_timeout_seconds: int = 600
    jplag_version: str = "5.1.0"
    # Optional working-directory prefix; default uses tempfile.mkdtemp.
    jplag_workspace_root: str = ""

    moss_user_email: str = ""
    moss_server_host: str = "moss.stanford.edu"
    moss_server_port: int = 7690

    codequiry_api_base: str = "https://codequiry.com/api/v1"
    codequiry_api_key: str = ""

    dolos_bin: str = "dolos"
    dolos_timeout_seconds: int = 600

    # ----- corpus -----
    corpus_shingle_size: int = 5
    corpus_top_k_candidates: int = 50
    corpus_min_token_count: int = 20

    # ----- run orchestration -----
    poll_interval_seconds: int = 5
    max_poll_iterations: int = 720  # 60 minutes at 5s
    suspicious_severity_medium: float = 0.7
    suspicious_severity_high: float = 0.85

    # ----- cross-service URLs -----
    # Accept both ``SUBMISSION_SERVICE_BASE`` (matches the field name) and
    # ``SUBMISSION_BASE_URL`` (what docker-compose actually sets across
    # services). Without the second alias the default
    # ``http://submission-service.internal:8080`` shadows the compose
    # value and submission lookups fail silently — the assignment's
    # submission_ids come back empty, JPlag runs stay queued forever.
    submission_service_base: str = Field(
        default="http://submission-service.internal:8080",
        validation_alias=AliasChoices(
            "SUBMISSION_SERVICE_BASE",
            "SUBMISSION_BASE_URL",
        ),
    )
    course_service_base: str = Field(
        default="http://course-service.internal:8080",
        validation_alias=AliasChoices(
            "COURSE_SERVICE_BASE",
            "COURSE_BASE_URL",
        ),
    )
    submission_service_token: str = ""
    submission_fetch_timeout_seconds: int = 30


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
