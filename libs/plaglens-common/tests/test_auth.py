from __future__ import annotations

import json
import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from plaglens_common.auth import (
    CurrentUser,
    JWKSCache,
    JWTBearer,
    revoke_check,
)
from plaglens_common.errors import TokenExpiredError, UnauthenticatedError


@pytest.fixture
def rsa_keys() -> tuple[rsa.RSAPrivateKey, dict[str, Any]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    public_numbers = public_key.public_numbers()

    def _b64url(n: int) -> str:
        import base64

        b = n.to_bytes((n.bit_length() + 7) // 8, "big")
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")

    jwk = {
        "kty": "RSA",
        "kid": "test-key",
        "use": "sig",
        "alg": "RS256",
        "n": _b64url(public_numbers.n),
        "e": _b64url(public_numbers.e),
    }
    return private_key, {"keys": [jwk]}


class _StubRedis:
    def __init__(self) -> None:
        self.store: dict[str, Any] = {}
        self.exists_keys: set[str] = set()

    async def get(self, key: str) -> Any:
        return self.store.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None) -> None:
        self.store[key] = value

    async def exists(self, key: str) -> int:
        return 1 if key in self.exists_keys else 0


class _StubCache(JWKSCache):
    def __init__(self, jwks: dict[str, Any]) -> None:
        super().__init__(jwks_url="http://stub", redis=None)
        self._stub_jwks = jwks

    async def get_jwks(self) -> dict[str, Any]:
        return self._stub_jwks


def _make_token(private_key: rsa.RSAPrivateKey, payload: dict[str, Any], kid: str = "test-key") -> str:
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": kid})


@pytest.mark.asyncio
async def test_verify_valid_token(rsa_keys: tuple[rsa.RSAPrivateKey, dict[str, Any]]) -> None:
    pk, jwks = rsa_keys
    bearer = JWTBearer(_StubCache(jwks), audience="plaglens", issuer="https://id.test")
    token = _make_token(
        pk,
        {
            "sub": "usr_1",
            "tenant_id": "tnt_1",
            "global_role": "teacher",
            "course_roles": {"crs_1": "owner"},
            "exp": int(time.time()) + 60,
            "iat": int(time.time()),
            "aud": "plaglens",
            "iss": "https://id.test",
            "jti": "abc",
        },
    )
    payload = await bearer.verify(token)
    assert payload["sub"] == "usr_1"
    assert payload["course_roles"] == {"crs_1": "owner"}


@pytest.mark.asyncio
async def test_verify_expired_token(rsa_keys: tuple[rsa.RSAPrivateKey, dict[str, Any]]) -> None:
    pk, jwks = rsa_keys
    bearer = JWTBearer(_StubCache(jwks), audience="plaglens", issuer="https://id.test")
    token = _make_token(
        pk,
        {
            "sub": "usr_1",
            "tenant_id": "tnt_1",
            "global_role": "teacher",
            "exp": int(time.time()) - 600,
            "iat": int(time.time()) - 1200,
            "aud": "plaglens",
            "iss": "https://id.test",
        },
    )
    with pytest.raises(TokenExpiredError):
        await bearer.verify(token)


@pytest.mark.asyncio
async def test_verify_missing_kid_rejected(rsa_keys: tuple[rsa.RSAPrivateKey, dict[str, Any]]) -> None:
    pk, jwks = rsa_keys
    bearer = JWTBearer(_StubCache(jwks), audience="plaglens", issuer="https://id.test")
    token = jwt.encode(
        {"sub": "x", "exp": int(time.time()) + 60},
        pk,
        algorithm="RS256",
    )
    with pytest.raises(UnauthenticatedError):
        await bearer.verify(token)


@pytest.mark.asyncio
async def test_jwks_cache_uses_redis_then_memory(monkeypatch: pytest.MonkeyPatch) -> None:
    redis = _StubRedis()
    redis.store["plaglens:jwks"] = json.dumps({"keys": [{"kid": "abc", "kty": "RSA"}]})
    cache = JWKSCache(jwks_url="http://stub", redis=redis)
    fetched = await cache.get_jwks()
    assert fetched["keys"][0]["kid"] == "abc"


@pytest.mark.asyncio
async def test_revoke_check_returns_true_when_jti_marked() -> None:
    redis = _StubRedis()
    redis.exists_keys.add("plaglens:jti_revoked:abc")
    is_revoked = revoke_check(redis)
    assert await is_revoked("abc") is True
    assert await is_revoked("zzz") is False


def test_current_user_model_defaults() -> None:
    u = CurrentUser(sub="x", tenant_id="t", global_role="student")
    assert u.course_roles == {}
    assert u.course_roles_truncated is False
