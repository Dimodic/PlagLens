"""OAuth provider abstractions.

Concrete provider implementations live in :mod:`.providers`. The :class:`OAuthProvider`
protocol defines the surface used by :mod:`identity_service.services.oauth_service`.
"""
from __future__ import annotations

from .providers import (
    GitHubProvider,
    GoogleProvider,
    OAuthProfile,
    OAuthProvider,
    StepikProvider,
    YandexProvider,
    get_provider,
    list_known_providers,
)

__all__ = [
    "OAuthProvider",
    "OAuthProfile",
    "GoogleProvider",
    "YandexProvider",
    "StepikProvider",
    "GitHubProvider",
    "get_provider",
    "list_known_providers",
]
