"""JWKS endpoint (public-key discovery for downstream services)."""
from __future__ import annotations

from fastapi import APIRouter

from ...common.security import jwks

router = APIRouter(tags=["security"])


@router.get(
    "/.well-known/jwks.json",
    summary="JSON Web Key Set (RS256 public keys)",
)
async def get_jwks() -> dict:
    return jwks()
