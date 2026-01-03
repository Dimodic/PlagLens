# PlagLens API Gateway

Public entry point for all PlagLens services. FastAPI-based reverse proxy.

## Responsibilities

- TLS termination (when not by edge ingress)
- JWT authentication (JWKS-based) + revoke list
- Coarse-grained RBAC (global_role)
- Routing to backend services per `gateway.yaml`
- Rate limiting (per-IP, per-user, per-endpoint-class) via Redis token bucket
- CORS, body limits, request ID, logging, tracing
- Idempotency-Key cache (POST replay)
- Circuit breaker per backend
- Universal `/v1/operations/{op_id}` dispatcher
- Aggregated `/v1/health`

## Stack

- Python 3.12+, FastAPI, Pydantic v2
- Redis (rate-limit, idempotency, JWKS cache, revoke list)
- httpx async client (proxy)
- structlog, prometheus_client
- PyJWT[crypto] for JWT/JWKS

## Endpoints owned by gateway

| Method | Path |
|---|---|
| GET | `/v1/health` |
| GET | `/v1/version` |
| GET | `/v1/services-status` |
| GET | `/v1/.well-known/jwks.json` |
| GET | `/v1/operations/{op_id}` |
| POST | `/v1/operations/{op_id}:cancel` |
| GET | `/v1/operations` |
| GET | `/healthz` |
| GET | `/readyz` |
| GET | `/metrics` |

All other `/api/v1/*` routes are forwarded to backend services.

## Run locally

```bash
pip install -e ".[dev]"
uvicorn gateway_service.main:app --reload
```

## Tests

```bash
pytest -q
ruff check src/ tests/
python -m compileall src/
```
