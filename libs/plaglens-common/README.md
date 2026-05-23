# plaglens-common

Shared abstractions for PlagLens microservices: errors, auth, RBAC, idempotency,
`02-RBAC.md`, `03-EVENTS.md`.

## Install

```bash
pip install plaglens-common[fastapi]
```

## Modules

### `problem` / `errors`
RFC 7807 problem details and a hierarchy of domain exceptions.

```python
from plaglens_common.problem import ProblemException, problem_exception_handler
from plaglens_common.errors import NotFoundError

# In a FastAPI app
app.add_exception_handler(ProblemException, problem_exception_handler)

# In handlers
raise NotFoundError("Course not found").to_exception()
```

### `pagination`
Cursor-based pagination per cross-cutting §4.

```python
from plaglens_common.pagination import (
    PaginatedResponse, CursorPagination, encode_cursor, decode_cursor,
    parse_pagination_query,
)

@app.get("/v1/courses", response_model=PaginatedResponse[Course])
def list_courses(p: CursorPagination = Depends(parse_pagination_query)):
    ...
```

### `operation`
Async Operation envelope (`/v1/operations/{id}`) + 202 + `Location` helper.

```python
from plaglens_common.operation import operation_response
return operation_response("op_8b7c1f2d")
```

### `auth`
JWT (RS256 + JWKS) bearer for FastAPI with Redis JWKS cache and revocation.

```python
from plaglens_common.auth import JWKSCache, JWTBearer, get_current_user, CurrentUser

jwks = JWKSCache(jwks_url=..., redis=redis_client)
bearer = JWTBearer(jwks_cache=jwks, audience="plaglens", issuer="https://id.plaglens.ru")

@app.get("/v1/me")
def me(user: CurrentUser = Depends(get_current_user(bearer))): ...
```

### `rbac`
Decorators for global / course role checks per RBAC §2-§4.

```python
from plaglens_common.rbac import require_global_role, require_course_role

@app.post("/v1/tenants")
@require_global_role("super_admin", "admin")
def create_tenant(...): ...

@app.patch("/v1/courses/{course_id}")
@require_course_role("owner", "co_owner")
def update_course(course_id: str, ...): ...
```

### `idempotency`
ASGI middleware: caches POST responses keyed by `Idempotency-Key`,
detects body conflict.

### `events`
CloudEvents envelope + thin `aiokafka` producer/consumer with idempotency
through a `ProcessedEventStore` Protocol.

### `health`
`/healthz`, `/readyz`, `/metrics`, `/v1/version` router factory.

### `metrics` / `logging` / `tracing`
Prometheus middleware, structlog JSON config, OpenTelemetry init.

### `headers`
Header-name constants + helpers.

### `service_client`
`httpx.AsyncClient` wrapper with retries, naive circuit breaker, X-Request-Id
propagation.

## Development

```bash
pip install -e .[dev,fastapi]
ruff check src tests
mypy --ignore-missing-imports src
pytest
```
