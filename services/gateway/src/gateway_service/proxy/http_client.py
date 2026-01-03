"""Shared httpx.AsyncClient for the gateway."""

from __future__ import annotations

import httpx

from gateway_service.config import settings


class _NoStoreCookies(httpx.Cookies):
    """SECURITY: cookie jar that drops all Set-Cookie headers from responses.

    httpx.AsyncClient's default behaviour is to accumulate Set-Cookie headers
    into a shared jar and auto-send them on subsequent requests. In a reverse
    proxy this **leaks** one user's `__Host-refresh` cookie to the next
    request and turns `/auth/refresh` into a credential-less auth bypass.

    Overriding `extract_cookies` to a no-op disables auto-collection while
    still allowing the proxy to forward whatever Cookie header the *original
    client* set (those live in the request headers, not in this jar).
    """

    def extract_cookies(self, response: httpx.Response) -> None:  # type: ignore[override]
        return None


class HttpClientHolder:
    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    def get(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(
                    settings.proxy_timeout_s,
                    connect=settings.proxy_connect_timeout_s,
                ),
                follow_redirects=False,
                cookies=_NoStoreCookies(),
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def set_client(self, client: httpx.AsyncClient) -> None:
        """For tests."""
        self._client = client


http_client_holder = HttpClientHolder()


def get_http_client() -> httpx.AsyncClient:
    return http_client_holder.get()


__all__ = ["http_client_holder", "get_http_client", "HttpClientHolder"]
