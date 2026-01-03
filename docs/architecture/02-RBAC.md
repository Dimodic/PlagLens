# RBAC: роли, разрешения, изоляция тенантов

> Документ описывает модель авторизации PlagLens. Применяется единообразно ко всем сервисам через помощник `plaglens-rbac`, читающий JWT и контекст ресурса.

## 1. Принципы

1. **Multi-tenant**: первичный фильтр — `tenant_id`. Любой запрос, попавший в сервис, валидируется на `tenant_id` ресурса == `tenant_id` JWT.
2. **Single endpoint, server-side filter**: эндпоинт один для всех ролей, видимость данных — на уровне репозитория.
3. **Two layers of roles**:
    - **Global role** — одна на пользователя в тенанте.
    - **Course role** — может быть много, по одной на курс, в котором участвует пользователь.
4. **Authorization decision** = `(global_role, course_role_for_resource, action, resource_owner)` → `allow | deny`.

## 2. Глобальные роли

| Role | Назначение |
|---|---|
| `super_admin` | Кросс-тенант. Управляет тенантами, системными настройками. Только у платформенных операторов. |
| `admin` | Внутри тенанта. Управляет пользователями, курсами, интеграциями, бюджетами LLM. |
| `teacher` | Может создавать курсы. Внутри своих курсов — `owner`. |
| `student` | Не может создавать курсы. Видит только курсы, в которых состоит. |

Один пользователь = одна global role в одном тенанте. Кросс-тенант доступ — только у `super_admin`.

## 3. Course-level роли

| Role | Кто назначает | Права |
|---|---|---|
| `owner` | Сам себя при `POST /courses` (если global=`teacher` или `admin`) | Полные права на курс, может назначать `co_owner` и `assistant`. |
| `co_owner` | `owner` курса | Всё то же, кроме удаления курса и смены `owner`. |
| `assistant` | `owner` или `co_owner` | Видит все посылки курса. Может проверять, оценивать, запускать LLM. Не может менять структуру курса (создавать задания), не управляет интеграциями, не приглашает участников. |
| `student` | `owner` / приглашение по коду / импорт | Видит только свои посылки. Видит % сходства по своим. |

## 4. Permission matrix (ключевые действия)

| Действие | super_admin | admin (тенант) | teacher (не свой курс) | owner | co_owner | assistant | student (свой) | student (чужой) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Create tenant | ✓ | — | — | — | — | — | — | — |
| Manage tenant settings | ✓ | ✓ | — | — | — | — | — | — |
| Manage users (CRUD) | ✓ | ✓ | — | — | — | — | self only | — |
| Create course | ✓ | ✓ | ✓ | — | — | — | — | — |
| Update course | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| Delete course | ✓ | ✓ | — | ✓ | — | — | — | — |
| Add co_owner / assistant | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| Add student | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| Create assignment | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| List submissions of course | ✓ | ✓ | — | ✓ | ✓ | ✓ | only own | — |
| Read any submission | ✓ | ✓ | — | ✓ | ✓ | ✓ | only own | — |
| Grade submission | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| Delete submission | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| Configure integration | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| Run plagiarism check | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| View plagiarism pairs | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| View own plagiarism % | — | — | — | — | — | — | ✓ | — |
| Run LLM analysis | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| View LLM report | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| Edit/share LLM comment | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| Configure LLM budget per course | ✓ | ✓ | — | ✓ | — | — | — | — |
| Export course | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| View course dashboard | ✓ | ✓ | — | ✓ | ✓ | ✓ | own metrics only | — |
| View tenant dashboard | ✓ | ✓ | — | — | — | — | — | — |
| View global dashboard | ✓ | — | — | — | — | — | — | — |
| Read audit log (course) | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| Read audit log (tenant) | ✓ | ✓ | — | — | — | — | — | — |

## 5. Multi-role между курсами

Пользователь может одновременно:
- Быть `student` в курсе A
- `assistant` в курсе B
- `owner` в курсе C

Authorization для запроса по конкретному курсу учитывает **только course role в этом курсе** (плюс global).

```
def authorize(user, action, resource):
    if user.global_role == "super_admin":
        return ALLOW
    if resource.tenant_id != user.tenant_id:
        return DENY  # tenant isolation
    course_id = resource.course_id  # может быть None
    course_role = user.course_roles.get(course_id)  # None если не участник
    return PERMISSIONS[user.global_role][course_role][action]
```

## 6. JWT payload (фрагмент)

```json
{
  "sub": "usr_8b7c1f2d",
  "tenant_id": "tnt_hse_cs",
  "global_role": "teacher",
  "course_roles": {
    "crs_42": "owner",
    "crs_77": "assistant"
  },
  "exp": 1735689600,
  "iat": 1735688700,
  "jti": "01HF8K9..."
}
```

`course_roles` ограничен 200 курсами в JWT; для пользователей в большем числе курсов — добавляется флаг `course_roles_truncated: true` и Identity Service возвращает полный список через `GET /v1/users/me/course-roles`.

## 7. Изоляция тенантов

- На уровне БД: каждая таблица содержит `tenant_id NOT NULL`. Все запросы фильтруют по `tenant_id` через middleware репозитория.
- На уровне MinIO: бакет per tenant (`plaglens-{tenant_slug}`) или префикс `{tenant_id}/...`.
- На уровне Kafka: `tenant_id` в headers каждого события; consumer'ы фильтруют до обработки.
- На уровне Redis: ключи префиксованы `{tenant_id}:...`.

Кросс-тенант доступ — **только** через `super_admin` JWT с явной заголовком `X-Cross-Tenant: <target_tenant_id>` и аудит-записью.

## 8. Контекстные правила (тонкости)

### Видимость удалённых ресурсов
- `?include_deleted=true` — `owner` курса и выше.

### Изменение чужих оценок
- `assistant` может менять оценки. Все изменения логируются в audit с пометкой `graded_by != student.user_id`.
- Студент не может оспорить из API; только через UI комментарий → события переписки (out of scope MVP).

### Студенческий self-service
- Студент видит **свои** submissions, оценки, % плагиата (без пар), LLM-комментарии **только если** `shared_with_student=true`.
- Студент **не видит** чужие посылки никогда.

### Преподаватели разных курсов
- `teacher` (global) без `course_role` для курса X — не имеет к X **никакого** доступа.

### Анонимизация
- При вызове `POST /v1/users/{id}:anonymize`:
    - Profile fields → `[anonymized]`
    - email → `anon-{hash}@deleted.local`
    - Submissions сохраняются (для статистики тенанта), но `author_id → null` (или `anon_id`)
    - Plagiarism pairs остаются
    - Это soft-irreversible (не восстанавливается).

## 9. Audit для авторизационных решений

Каждый `403 FORBIDDEN` пишется в Audit Service:
- кто
- какой эндпоинт
- какой ресурс
- какая роль не сошлась
Чтобы можно было ловить попытки эскалации.

## 10. Реализация (helper)

```python
# plaglens-rbac/decorators.py

@require_global_role("admin")
def patch_tenant_settings(...): ...

@require_course_role("owner", "co_owner")
def update_course(course_id, ...): ...

@require_course_role("owner", "co_owner", "assistant")
@require_resource_owner_or_role("student", own_only=True)
def get_submission(submission_id, ...): ...
```

В каждом сервисе декораторы дёргают общий `authz` модуль, который вычитывает JWT и проверяет таблицу разрешений.
