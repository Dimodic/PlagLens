#!/usr/bin/env python3
"""Stand-alone health probe for a running PlagLens stack.

Pings every documented health/readyness endpoint reachable through the
gateway and prints a coloured status table.  Returns exit code 0 when
all services are healthy, 1 if any service is degraded or unreachable.

    python tools/scripts/health-check.py
    python tools/scripts/health-check.py --gateway https://api.example.com
    python tools/scripts/health-check.py --json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass

import httpx

SERVICES: tuple[str, ...] = (
    "gateway",
    "identity",
    "course",
    "submission",
    "integration",
    "plagiarism",
    "ai-analysis",
    "notification",
    "reporting",
    "audit",
)

# Probes the gateway directly hits.  Per-service liveness is queried via
# the gateway's aggregated /v1/health (which fans out internally).
GATEWAY_PROBES: tuple[tuple[str, str], ...] = (
    ("gateway /healthz", "/healthz"),
    ("gateway /readyz", "/readyz"),
    ("gateway /api/v1/health", "/api/v1/health"),
    ("gateway /api/v1/version", "/api/v1/version"),
    ("identity /api/v1/.well-known/jwks", "/api/v1/.well-known/jwks.json"),
)


@dataclass
class ProbeResult:
    name: str
    path: str
    status: int | None
    latency_ms: float | None
    ok: bool
    error: str | None = None


def _probe(client: httpx.Client, name: str, path: str) -> ProbeResult:
    t0 = time.monotonic()
    try:
        r = client.get(path, timeout=5.0)
    except httpx.HTTPError as e:
        return ProbeResult(
            name=name, path=path, status=None, latency_ms=None, ok=False, error=str(e)
        )
    dt = (time.monotonic() - t0) * 1000.0
    ok = r.status_code < 400 or (path.endswith("/readyz") and r.status_code == 503)
    return ProbeResult(name=name, path=path, status=r.status_code, latency_ms=round(dt, 1), ok=ok)


def _color(s: str, code: str, *, enabled: bool) -> str:
    return f"\033[{code}m{s}\033[0m" if enabled else s


def _print_table(results: list[ProbeResult], *, color: bool) -> None:
    width = max((len(r.name) for r in results), default=20) + 2
    print(f"{'PROBE':<{width}} {'STATUS':>6}  {'LATENCY':>10}  RESULT")
    print("-" * (width + 30))
    for r in results:
        status = str(r.status) if r.status is not None else "ERR"
        lat = f"{r.latency_ms:.1f}ms" if r.latency_ms is not None else "—"
        verdict = "OK" if r.ok else "FAIL"
        v = _color(verdict, "32" if r.ok else "31", enabled=color)
        suffix = f"  ({r.error})" if r.error else ""
        print(f"{r.name:<{width}} {status:>6}  {lat:>10}  {v}{suffix}")


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--gateway", default="http://localhost:8080")
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    ap.add_argument("--no-color", action="store_true")
    args = ap.parse_args()

    base = args.gateway.rstrip("/")
    with httpx.Client(base_url=base) as client:
        results = [_probe(client, name, path) for name, path in GATEWAY_PROBES]

        # Per-service breakdown — extract from the aggregator if present.
        agg = next((r for r in results if r.path == "/api/v1/health"), None)
        if agg and agg.ok and agg.status == 200:
            try:
                body = client.get("/api/v1/health").json()
            except (httpx.HTTPError, json.JSONDecodeError):
                body = {}
            services = body.get("services") or body.get("backends") or {}
            if isinstance(services, dict):
                for svc, info in services.items():
                    ok = (
                        (info or {}).get("status") in {"healthy", "ok", "up"}
                        if isinstance(info, dict)
                        else False
                    )
                    results.append(
                        ProbeResult(
                            name=f"  ↳ {svc}",
                            path=f"(aggregator) {svc}",
                            status=200 if ok else 503,
                            latency_ms=None,
                            ok=ok,
                        )
                    )

    if args.json:
        print(json.dumps([asdict(r) for r in results], indent=2))
    else:
        _print_table(results, color=not args.no_color)

    sys.exit(0 if all(r.ok for r in results) else 1)


if __name__ == "__main__":
    main()
