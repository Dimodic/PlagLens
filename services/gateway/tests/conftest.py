"""Test fixtures: fakeredis client + RSA key pair for signing JWTs."""

from __future__ import annotations

import base64
import json
import time
import uuid
from collections.abc import Iterator
from typing import Any

import fakeredis.aioredis
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from gateway_service.config import settings
from gateway_service.jwks import jwks_cache
from gateway_service.main import create_app
from gateway_service.proxy.http_client import http_client_holder
from gateway_service.redis_client import redis_holder

# ---------- RSA / JWKS ----------


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


@pytest.fixture(scope="session")
def rsa_keypair() -> dict[str, Any]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = private.public_key()
    nums = public.public_numbers()
    n = nums.n.to_bytes((nums.n.bit_length() + 7) // 8, "big")
    e = nums.e.to_bytes((nums.e.bit_length() + 7) // 8, "big")
    kid = "test-key-1"
    jwk = {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": kid,
        "n": _b64url(n),
        "e": _b64url(e),
    }
    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return {"jwk": jwk, "private_pem": pem, "kid": kid}


def make_token(
    rsa_keypair: dict[str, Any],
    *,
    sub: str = "usr_1",
    tenant: str = "tnt_test",
    role: str = "teacher",
    course_roles: dict[str, str] | None = None,
    aud: str | None = None,
    expired: bool = False,
    jti: str | None = None,
) -> str:
    now = int(time.time())
    payload = {
        "sub": sub,
        "tenant_id": tenant,
        "global_role": role,
        "course_roles": course_roles or {},
        "iat": now - 10,
        "exp": now - 60 if expired else now + 600,
        "jti": jti or uuid.uuid4().hex,
        "aud": aud if aud is not None else settings.jwt_audience,
    }
    return jwt.encode(
        payload,
        rsa_keypair["private_pem"],
        algorithm="RS256",
        headers={"kid": rsa_keypair["kid"]},
    )


# ---------- App + clients ----------


@pytest.fixture(autouse=True)
def _fake_redis(rsa_keypair) -> Iterator[Any]:
    """Inject a fakeredis instance into the gateway's redis_holder."""
    fr = fakeredis.aioredis.FakeRedis(decode_responses=True)
    redis_holder.set_client(fr)
    # Pre-seed JWKS in process cache so tests don't hit network.
    jwks_cache.set({"keys": [rsa_keypair["jwk"]]})
    yield fr
    # cleanup
    jwks_cache.set({"keys": []})
    redis_holder._client = None  # type: ignore[attr-defined]


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c
    # Reset shared http client between tests
    http_client_holder._client = None  # type: ignore[attr-defined]


@pytest.fixture
def auth_headers(rsa_keypair) -> dict[str, str]:
    return {"Authorization": "Bearer " + make_token(rsa_keypair)}


@pytest.fixture
def super_admin_headers(rsa_keypair) -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + make_token(rsa_keypair, sub="usr_admin", role="super_admin")
    }


@pytest.fixture
def factory_make_token(rsa_keypair):
    def _f(**kwargs: Any) -> str:
        return make_token(rsa_keypair, **kwargs)

    return _f


def _decode_json(text: str | bytes) -> Any:
    if isinstance(text, bytes):
        text = text.decode()
    return json.loads(text)
