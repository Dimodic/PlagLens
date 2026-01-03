# PlagLens E2E tests

End-to-end smoke + happy-path tests that run against a live (or
docker-compose'd) PlagLens stack and exercise the gateway plus all 10
backend services.

## Quick start

```bash
# 1. boot the full stack
make build && make up

# 2. wait for healthy
curl -fsS http://localhost:8080/healthz

# 3. run the suite
make e2e
```

`make e2e` is just a wrapper around:

```bash
python -m pytest tools/e2e/ -v --tb=short
```

## Configuration

Read from environment:

| Variable                   | Default                      | Purpose                                |
| -------------------------- | ---------------------------- | -------------------------------------- |
| `PLAGLENS_GATEWAY_URL`     | `http://localhost:8080`      | Base URL of the API gateway            |
| `PLAGLENS_TEST_TENANT`     | `e2e-tenant`                 | Slug of the tenant to register against |
| `PLAGLENS_TEST_EMAIL`      | random `e2e+<uuid>@…`        | Test user email                        |
| `PLAGLENS_TEST_PWD`        | `e2e-Pa55w0rd!`              | Test user password                     |
| `PLAGLENS_TEST_TIMEOUT`    | `10`                         | HTTP timeout, seconds                  |
| `PLAGLENS_DEV_JWT_SECRET`  | `dev-secret-do-not-use-in-prod` | Used **only** for the locally signed fallback token |

## What's covered

* `/healthz`, `/readyz` per service via gateway aggregator
* Aggregated `/api/v1/health`
* JWKS at `/api/v1/.well-known/jwks.json`
* `401 Unauthenticated` on protected endpoints without JWT
* `403 TENANT_MISMATCH` on cross-tenant access
* Happy path: register → login → create course → create assignment →
  upload submission → poll operation

## Behaviour when a route isn't built yet

Tests use `pytest.skip(...)` (not `fail`) on `404` from the gateway —
the suite is forward-compatible with KT-1 (architecture-only) and with
later KTs as services come online.

## Skipping the whole suite

If `/healthz` is unreachable for ~2 seconds, the entire session
auto-skips with a clear message — useful in CI when compose hasn't
finished booting yet.

## Adding a test

1. Drop a `test_<feature>.py` next to `test_smoke.py`.
2. Use the `http_client`, `auth_headers`, `gateway_url` fixtures from
   `conftest.py`.
3. Wrap doubtful endpoints in `_ok_or_skip(...)` so the test stays
   green while the feature is still being built.
