# Identity Service

> Объединяет роль KT-1 «Auth Service» и «User Service». Отвечает за аутентификацию (email+password, OAuth, 2FA), управление пользователями, тенантами, ролями, сессиями, API ключами.

**База URL префикс:** `/api/v1`

## Сущности

```
Tenant
  id, slug, name, domain, status (active/suspended), settings (JSON), cors_origins[], created_at, deleted_at

User
  id, tenant_id, email (unique within tenant), email_verified_at, password_hash (nullable),
  display_name, avatar_url, locale, timezone, status (active/disabled), global_role,
  created_at, last_login_at, deleted_at, anonymized_at

OAuthIdentity
  id, user_id, provider (google/yandex/stepik/github), provider_user_id (unique per provider),
  email, raw_profile (JSON), linked_at

ExternalBinding
  id, user_id, system (stepik/yandex_contest), external_id, display_name, linked_at

Session
  id, user_id, refresh_token_hash, ip, user_agent, created_at, last_used_at, expires_at, revoked_at

ApiKey
  id, owner_user_id, name, key_hash, scopes[], created_at, last_used_at, expires_at, revoked_at

PasswordResetToken
  id, user_id, token_hash, expires_at, used_at

EmailVerifyToken
  id, user_id, email, token_hash, expires_at, used_at

TwoFactorSecret
  user_id (PK), secret_encrypted, backup_codes[] (encrypted), enabled_at

Invitation
  id, tenant_id, email, role, course_id (nullable), token_hash, expires_at, accepted_by, accepted_at
```

## Эндпоинты

### A. Аутентификация (email + password)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/auth/register` | Самостоятельная регистрация студента/преподавателя | public |
| POST | `/auth/login` | Логин по email+password | public |
| POST | `/auth/logout` | Завершить сессию (отозвать refresh) | bearer |
| POST | `/auth/refresh` | Обновить access token из refresh-cookie | refresh-cookie |
| GET | `/auth/me` | Текущий пользователь (JWT decode + DB lookup) | bearer |

**`POST /auth/register`**
```json
// request
{ "email": "ivan@hse.ru", "password": "...", "display_name": "Иван И.",
  "tenant_slug": "hse", "locale": "ru", "invitation_token": "..." }
// response 201
{ "user_id": "usr_8b7c", "email_verification_required": true }
```
- `tenant_slug` — обязателен; если приватный тенант, требует `invitation_token`.
- Возвращает 409 `CONFLICT` если email занят.
- Эмитит `identity.user.registered.v1` + отправляет email-verification.

**`POST /auth/login`**
```json
// request
{ "email": "...", "password": "...", "tenant_slug": "hse", "totp_code": "123456" }
// response 200
{ "access_token": "eyJ...", "expires_in": 900, "user": { ... } }
// + Set-Cookie: __Host-refresh=...
```
- Если 2FA включена и `totp_code` отсутствует — 401 + `code: TWO_FACTOR_REQUIRED` + `mfa_token` (одноразовый, для второго запроса).
- Rate-limit: 5/min per email.

**`POST /auth/logout`**
- Body пустой; сервер ревокает refresh-token (Redis revoke list), чистит cookie.
- 204 No Content.

**`POST /auth/refresh`**
- Кука `__Host-refresh` обязательна.
- Server проверяет в Redis (revoke list + TTL).
- Возвращает новый access + ротирует refresh.

**`GET /auth/me`**
```json
{ "id": "usr_...", "email": "...", "display_name": "...", "avatar_url": "...",
  "global_role": "teacher", "course_roles": { "crs_42": "owner" },
  "tenant": { "id": "tnt_hse", "slug": "hse", "name": "..." },
  "email_verified": true, "two_factor_enabled": false, "linked_oauth": ["google"] }
```

### B. Восстановление и смена пароля

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/auth/password/forgot` | Запросить ссылку для сброса | public |
| POST | `/auth/password/reset` | Сбросить пароль по токену из email | public |
| POST | `/auth/password/change` | Сменить пароль текущему юзеру | bearer |

**`POST /auth/password/forgot`** — `{ "email": "...", "tenant_slug": "hse" }` → 202 (всегда 202, чтобы не выдавать существование email). Отправляет email с одноразовой ссылкой.

**`POST /auth/password/reset`** — `{ "token": "...", "new_password": "..." }` → 204. Все сессии юзера ревокаются.

**`POST /auth/password/change`** — `{ "current_password": "...", "new_password": "..." }` → 204.

### C. Подтверждение email

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/auth/email/verify/request` | Отправить ссылку повторно | bearer |
| POST | `/auth/email/verify/confirm` | Подтвердить по токену | public |
| POST | `/auth/email/change/request` | Сменить email — отправить токен на новый | bearer |
| POST | `/auth/email/change/confirm` | Подтвердить смену | public |

### D. Двухфакторная аутентификация (TOTP)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/auth/2fa/enroll` | Сгенерировать secret + QR (otpauth URI) | bearer |
| POST | `/auth/2fa/enable` | Подтвердить enrollment одним TOTP-кодом | bearer |
| POST | `/auth/2fa/disable` | Отключить (требует password) | bearer |
| POST | `/auth/2fa/backup-codes` | Сгенерировать новые backup-коды | bearer |
| POST | `/auth/2fa/verify` | Использовать код во второй фазе login | public + `mfa_token` |

### E. OAuth / Social login

Провайдеры: `google`, `yandex`, `stepik`, `github`. Идентичный шаблон.

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/auth/oauth/{provider}/authorize` | Старт OAuth (redirect к провайдеру) | public |
| GET | `/auth/oauth/{provider}/callback` | OAuth callback — обмен кода на токен | public |
| POST | `/auth/oauth/{provider}/link` | Привязать соц. сеть к существующему юзеру | bearer |
| DELETE | `/auth/oauth/{provider}/unlink` | Отвязать | bearer |

`/authorize` принимает `?return_url=` и `?tenant_slug=` (для multi-tenant), пишет state в Redis на 10 мин.
`/callback` либо логинит существующего, либо создаёт нового пользователя в указанном тенанте, либо триггерит link-confirm flow (если такой email уже существует, но не linked).

### F. Tenants

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/tenants` | Список тенантов | super_admin |
| POST | `/tenants` | Создать тенант | super_admin |
| GET | `/tenants/{id}` | Деталь | super_admin / member |
| PATCH | `/tenants/{id}` | Обновить (название, домен) | super_admin / admin |
| DELETE | `/tenants/{id}` | Soft delete | super_admin |
| POST | `/tenants/{id}:suspend` | Приостановить | super_admin |
| POST | `/tenants/{id}:activate` | Восстановить | super_admin |
| GET | `/tenants/{id}/settings` | Настройки (CORS origins, лимиты, default-провайдеры) | admin |
| PATCH | `/tenants/{id}/settings` | Обновить | admin |
| GET | `/tenants/{id}/usage` | Метрики использования (студенты, курсы, посылки, токены LLM) | admin |
| GET | `/tenants/{id}/audit` | Аудит на уровне тенанта (proxy в Audit Service) | admin |

### G. Users — управление

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users` | Список (filter: role, course_id, status, q, ...) | admin / teacher |
| POST | `/users` | Создать (admin add) | admin |
| POST | `/users:batchCreate` | Массовое создание (bulk invite по списку email) | admin / teacher |
| GET | `/users/{id}` | Деталь | admin / self / teacher для своих курсов |
| PATCH | `/users/{id}` | Обновить (display_name, locale, role) | admin / self (limited fields) |
| DELETE | `/users/{id}` | Soft delete | admin |
| POST | `/users/{id}:disable` | Заблокировать (без удаления) | admin |
| POST | `/users/{id}:enable` | Разблокировать | admin |
| POST | `/users/{id}:anonymize` | GDPR-анонимизация (необратимо) | admin / self |
| POST | `/users/{id}:reset-password` | Запустить flow сброса пароля для юзера | admin |
| POST | `/users/{id}:force-logout` | Ревокнуть все сессии | admin |
| GET | `/users/{id}/sessions` | Список активных сессий | admin / self |
| GET | `/users/{id}/audit` | Активность юзера | admin / self |

### H. Self-service (текущий пользователь)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users/me` | Алиас для `/auth/me` | bearer |
| PATCH | `/users/me` | Обновить свой профиль | bearer |
| POST | `/users/me/avatar` | Загрузить аватар (multipart) | bearer |
| DELETE | `/users/me/avatar` | Удалить | bearer |
| GET | `/users/me/sessions` | Свои сессии | bearer |
| DELETE | `/users/me/sessions/{session_id}` | Завершить конкретную | bearer |
| POST | `/users/me/sessions:revokeAll` | Завершить все, кроме текущей | bearer |
| GET | `/users/me/course-roles` | Полный список course-ролей (если в JWT было truncated) | bearer |
| GET | `/users/me/notifications-settings` | (proxy в Notification Service) | bearer |

### I. External bindings (привязка внешних аккаунтов: Stepik, Я.Контест)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users/{id}/external-bindings` | Список | admin / self |
| POST | `/users/{id}/external-bindings` | Добавить (`{ "system": "stepik", "external_id": "...", "display_name": "..." }`) | admin / self |
| DELETE | `/users/{id}/external-bindings/{binding_id}` | Удалить | admin / self |

(Используется для маппинга «Stepik user 12345 = User usr_8b7c», чтобы импорт назначал посылки правильному юзеру.)

### J. Roles & permissions

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/roles` | Список глобальных ролей | bearer |
| GET | `/roles/{role}/permissions` | Список permissions для роли | bearer |
| POST | `/users/{id}/role` | Назначить глобальную роль (`{ "role": "teacher" }`) | admin |
| GET | `/users/{id}/course-roles` | Роли в курсах | admin / self |

(Course-роли назначаются через Course Service, см. `05-COURSE.md`.)

### K. Invitations

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/invitations` | Создать invitation (`{ email, role, course_id?, expires_in }`) | admin / teacher |
| GET | `/invitations` | Список собственных invitations | admin / teacher |
| GET | `/invitations/{id}` | Деталь | admin / teacher |
| DELETE | `/invitations/{id}` | Отозвать | admin / teacher |
| GET | `/invitations/by-token/{token}` | Прочитать инвайт по токену (для UI «принять приглашение») | public |
| POST | `/invitations:accept` | Принять (`{ token, password? }`) | public / bearer |

### L. API Keys (для интеграций / админ-скриптов)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users/me/api-keys` | Список своих ключей | bearer |
| POST | `/users/me/api-keys` | Создать (response: ключ показывается ОДИН раз) | bearer |
| DELETE | `/users/me/api-keys/{id}` | Отозвать | bearer |
| POST | `/users/me/api-keys/{id}:rotate` | Ротировать (новый ключ, старый отзывается) | bearer |

API Keys имеют ограниченный набор scopes (например `submissions:read`), не равно полному JWT.

### M. Cross-tenant operations (super_admin)

| Method | Path | Описание |
|---|---|---|
| GET | `/admin/tenants` | Алиас GET /tenants |
| POST | `/admin/cross-tenant/migrate-user` | Перенести юзера между тенантами |
| GET | `/admin/users` | Cross-tenant поиск |

### N. Health

| Method | Path |
|---|---|
| GET | `/healthz` |
| GET | `/readyz` |
| GET | `/metrics` |
| GET | `/v1/version` |

## События, которые публикует Identity

См. `03-EVENTS.md`, секция Identity.

## Метрики (специфичные)

- `identity_logins_total{result}` — `success`, `bad_password`, `mfa_required`, `account_locked`
- `identity_registrations_total`
- `identity_oauth_logins_total{provider, result}`
- `identity_password_resets_total`
- `identity_active_sessions` (gauge)
- `identity_anonymizations_total`

## Реализация: критичные моменты

1. **Хеш паролей**: Argon2id, parameters tuned for ~250ms.
2. **Refresh-token rotation**: при каждом `/auth/refresh` старый токен попадает в revoke list (Redis SET с TTL = remaining lifetime), новый генерируется.
3. **Rate-limit для login/register/password-reset**: per email + per IP.
4. **Email-flows**: токены — opaque, хранятся как `sha256(token)` в БД; в email уходит plain.
5. **2FA**: secret шифруется envelope encryption (KEK в Vault, DEK per-tenant).
6. **OAuth state**: `state` хранится в Redis 10 мин с привязкой к session_id из cookie.
7. **Anonymize**: триггерит каскад событий, чтобы Submission/Plagiarism/AI обновили свои денормализованные данные.
8. **JWT key rotation**: ключи хранятся в Vault; ежемесячная ротация; параллельное доверие ≥2 ключам через JWKS endpoint `/api/v1/.well-known/jwks.json`.
