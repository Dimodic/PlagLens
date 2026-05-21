# PlagLens Identity Service

Authentication, user management, tenant management, RBAC, OAuth, 2FA, API keys
for the PlagLens platform. Implements the spec in `docs/architecture/legacy/04-IDENTITY.md`.

## Tech stack

- **Runtime**: Python 3.12+, FastAPI 0.110+, Uvicorn
- **Validation**: Pydantic v2 + pydantic-settings
- **Persistence**: PostgreSQL (asyncpg) via SQLAlchemy 2.x async; Alembic migrations
  (schema `identity`)
- **Cache / sessions**: Redis (refresh-token revoke list, OAuth state, idempotency)
- **Eventing**: Kafka via aiokafka (CloudEvents-compatible envelopes)
- **Observability**: structlog (JSON), Prometheus metrics
- **Crypto**: argon2-cffi (passwords), PyJWT[crypto] RS256 (access tokens),
  authlib (OAuth Google/Yandex/Stepik/GitHub), pyotp (TOTP), Fernet (2FA secrets)

## Run locally

```bash
pip install -e .[dev]
alembic upgrade head
uvicorn identity_service.main:app --reload --port 8080
```

OpenAPI: <http://localhost:8080/docs>
JSON: <http://localhost:8080/openapi.json>
JWKS: <http://localhost:8080/api/v1/.well-known/jwks.json>

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://identity:identity@localhost:5432/identity` | Async DSN |
| `REDIS_URL` | `redis://localhost:6379/0` | |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated |
| `JWT_PRIVATE_KEY_PATH` | `keys/jwt-private.pem` | RS256 private key (PEM) |
| `JWT_PUBLIC_KEY_PATH` | `keys/jwt-public.pem` | RS256 public key (PEM) |
| `JWT_KID` | `kid-1` | Current key id (for JWKS) |
| `JWT_ACCESS_TTL_SECONDS` | `900` | 15 min |
| `REFRESH_TTL_SECONDS` | `2592000` | 30 days |
| `ARGON2_TIME_COST` | `3` | |
| `ARGON2_MEMORY_KIB` | `65536` | |
| `ARGON2_PARALLELISM` | `2` | |
| `TOTP_FERNET_KEY` | (generate) | base64 32-byte Fernet key for 2FA secret encryption |
| `OAUTH_PROVIDERS_ENABLED` | `google,yandex,stepik,github` | Subset of providers active for this deployment |
| `OAUTH_CALLBACK_BASE_URL` | `http://localhost:8000` | Gateway origin appended to `/api/v1/auth/oauth/{provider}/callback` |
| `OAUTH_STATE_TTL_SECONDS` | `600` | Redis TTL for `state` + PKCE verifier |
| `GOOGLE_CLIENT_ID` / `_SECRET` | empty | Modern names; `OAUTH_GOOGLE_*` accepted as fallback |
| `YANDEX_CLIENT_ID` / `_SECRET` | empty | |
| `STEPIK_CLIENT_ID` / `_SECRET` | empty | |
| `GITHUB_CLIENT_ID` / `_SECRET` | empty | |
| `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` / `MAILGUN_FROM` | empty | Email transport (stubbed) |
| `IDENTITY_BASE_URL` | `http://localhost:8080` | OAuth callback prefix |
| `ENVIRONMENT` | `local` | `local` / `staging` / `prod` (cookie Secure flag) |

## Endpoint count

The service mounts ~55 routes under `/api/v1` matching the spec. The full list is
visible at `/openapi.json`.

## OAuth setup

The four providers (`google`, `yandex`, `stepik`, `github`) plug into the same
authorization-code + PKCE flow. The callback URL has a stable shape:

```
{OAUTH_CALLBACK_BASE_URL}/api/v1/auth/oauth/{provider}/callback
```

For local dev with the default gateway port `8000`, register these URLs:

### Google

1. Open <https://console.cloud.google.com/> and create a project (or pick one).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
3. Application type: *Web application*.
4. Authorized redirect URI:
   `http://localhost:8000/api/v1/auth/oauth/google/callback`
5. Copy the *Client ID* / *Client secret* into `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.

### Yandex

1. <https://oauth.yandex.ru/client/new>.
2. Platform: *Web services*.
3. Redirect URI:
   `http://localhost:8000/api/v1/auth/oauth/yandex/callback`
4. Permissions: `login:email`, `login:info`.
5. Copy the *ID* / *Password* into `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET`.

### Stepik

1. <https://stepik.org/oauth2/applications/>.
2. Client type: *Confidential*; Authorization grant type: *Authorization code*.
3. Redirect URI:
   `http://localhost:8000/api/v1/auth/oauth/stepik/callback`
4. Copy the *Client ID* / *Client Secret* into `STEPIK_CLIENT_ID` /
   `STEPIK_CLIENT_SECRET`.

### GitHub

1. <https://github.com/settings/applications/new>.
2. Authorization callback URL:
   `http://localhost:8000/api/v1/auth/oauth/github/callback`
3. Copy the *Client ID* / *Client secret* into `GITHUB_CLIENT_ID` /
   `GITHUB_CLIENT_SECRET`.

A provider with empty credentials is treated as "configured but not
initialised" — `/authorize` returns 400 with a clear `Problem` body. The
service still starts; only the disabled provider rejects calls.

## Implementation notes / deviations

- **Email transport**: stubbed (logs the link). Plug in Mailgun / Notification
  Service in `services/email_service.py`.
- **Vault**: 2FA secrets are encrypted with a Fernet key from env (`TOTP_FERNET_KEY`).
  Production target is Vault transit encryption.
- **Audit**: per-resource audit logs are owned by the Audit Service. The
  gateway routes `/users/{id}/audit` and `/courses/{id}/audit` straight to it;
  tenant-level audit is the tenant-scoped `GET /audit/events`. Identity no
  longer carries proxy stubs for these.
- **MinIO avatar upload**: `/users/me/avatar` accepts multipart but persists only
  metadata; binary upload to MinIO is a TODO.
- **Course Service cross-call**: course-role lookups inside `GET /users/me`
  return only the JWT-embedded `course_roles` until the Course Service is up.
- **Cross-tenant migrate-user**: real data move is out of scope here; route is
  registered with 501 + `Problem` body.
- **Batch invite**: returns an `Operation` accepted-handle; the worker is a TODO.

## Testing

```bash
pytest -q
ruff check src/
python -m compileall src/
```

Tests use SQLite (aiosqlite) with the `identity.` schema collapsed to the default
namespace via a metadata bind, an in-memory fake Redis, and a no-op Kafka producer
fixture.
