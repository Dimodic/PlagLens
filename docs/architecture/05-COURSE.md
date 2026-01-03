# Course Service

> Объединяет KT-1 «Course Service» и «Assignment Service». Управляет курсами, группами, заданиями, дедлайнами, участниками и приглашениями в курс. Не хранит сами посылки (это Submission Service).

**База URL префикс:** `/api/v1`

## Сущности

```
Course
  id, tenant_id, slug, name, description, status (draft/active/archived),
  start_date, end_date, owner_id (primary), settings (JSON: cors_origins, default-провайдеры),
  created_at, updated_at, deleted_at

CourseOwner
  course_id, user_id, role (owner/co_owner), assigned_at

CourseMember
  id, course_id, user_id, role (student/assistant), joined_at, removed_at

CourseInvitation
  id, course_id, code, role (student/assistant), email (nullable), max_uses, used_count,
  expires_at, created_by, created_at

Group  (поток / семинар)
  id, course_id, name, capacity, settings (JSON), created_at

GroupMember
  group_id, user_id, joined_at

Assignment
  id, course_id, slug, title, description, language_hint (python/cpp/...),
  status (draft/published/archived), max_score, weight,
  deadline_soft_at, deadline_hard_at, late_score_multiplier,
  selection_strategy (last/best/manual),
  plagiarism_auto_run (bool), plagiarism_threshold (float),
  ai_auto_run (bool), ai_prompt_version (default null=tenant default),
  external_bindings (JSON: [{system, external_assignment_id}]),
  created_at, updated_at, deleted_at

AssignmentGradingConfig
  assignment_id (PK), rubric (JSON), pass_threshold,
  visible_to_students_at (timestamp; до этого момента ученик видит submission, но не оценку)
```

## Эндпоинты

### A. Courses

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses` | Список курсов в тенанте (фильтры: status, owner, member, q) | tenant member |
| POST | `/courses` | Создать курс (создатель = `owner`) | teacher / admin |
| GET | `/courses/{id}` | Деталь | course member / admin |
| PATCH | `/courses/{id}` | Обновить (name, description, dates, settings) | owner / co_owner / admin |
| DELETE | `/courses/{id}` | Soft delete | owner / admin |
| POST | `/courses/{id}:archive` | Архивировать | owner / co_owner / admin |
| POST | `/courses/{id}:unarchive` | Разархивировать | owner / co_owner / admin |
| POST | `/courses/{id}:duplicate` | Скопировать структуру (без участников и посылок) | owner / co_owner |
| GET | `/courses/{id}/dashboard` | Дашборд (proxy в Reporting Service) | course member |

**`POST /courses`**
```json
{ "slug": "ds-2026-spring", "name": "Анализ данных", "description": "...",
  "start_date": "2026-02-01", "end_date": "2026-06-30" }
```
- 201 + `Location: /v1/courses/{id}`. Эмитит `course.course.created.v1`.
- `slug` уникален в рамках тенанта.

### B. Course owners

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/owners` | Список преподавателей-владельцев | course member |
| POST | `/courses/{id}/owners` | Назначить co-owner (`{user_id}`) | owner |
| DELETE | `/courses/{id}/owners/{user_id}` | Снять co_owner | owner |
| POST | `/courses/{id}/owners/{user_id}:promote` | Сделать primary owner (нынешний становится co_owner) | owner |

### C. Course members

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/members` | Список (filter: role) | owner / co_owner / assistant / admin |
| POST | `/courses/{id}/members` | Добавить (`{user_id, role}`) | owner / co_owner |
| POST | `/courses/{id}/members:batchCreate` | Массовое добавление (`{members: [{user_id, role}, ...]}`) | owner / co_owner |
| POST | `/courses/{id}/members:bulkInvite` | Пригласить по списку email (создаёт инвайты) | owner / co_owner |
| GET | `/courses/{id}/members/{user_id}` | Деталь | owner / co_owner / self |
| PATCH | `/courses/{id}/members/{user_id}` | Сменить role (student↔assistant) | owner / co_owner |
| DELETE | `/courses/{id}/members/{user_id}` | Удалить из курса | owner / co_owner |
| POST | `/courses/{id}/members/{user_id}:transfer-group` | Перевести между группами | owner / co_owner / assistant |

### D. Invitations (per-курс)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/invitations` | Список инвайтов | owner / co_owner |
| POST | `/courses/{id}/invitations` | Создать одноразовый или multi-use код | owner / co_owner |
| GET | `/courses/{id}/invitations/{inv_id}` | Деталь | owner / co_owner |
| DELETE | `/courses/{id}/invitations/{inv_id}` | Отозвать | owner / co_owner |
| POST | `/courses:joinByCode` | Студент присоединяется по коду | bearer |

`POST /courses:joinByCode` — `{ "code": "ABCD-1234" }` → 200 + `course_id`. Проверяет expires/max_uses, увеличивает used_count, создаёт `CourseMember`, эмитит `course.member.added.v1`.

### E. Groups

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/groups` | Список групп курса | course member |
| POST | `/courses/{id}/groups` | Создать (`{name, capacity}`) | owner / co_owner |
| GET | `/courses/{id}/groups/{group_id}` | Деталь | course member |
| PATCH | `/courses/{id}/groups/{group_id}` | Обновить | owner / co_owner |
| DELETE | `/courses/{id}/groups/{group_id}` | Удалить | owner / co_owner |
| GET | `/courses/{id}/groups/{group_id}/members` | Состав группы | owner / co_owner / assistant |
| POST | `/courses/{id}/groups/{group_id}/members` | Добавить (`{user_id}`) | owner / co_owner |
| POST | `/courses/{id}/groups/{group_id}/members:batchCreate` | Массово | owner / co_owner |
| DELETE | `/courses/{id}/groups/{group_id}/members/{user_id}` | Удалить | owner / co_owner |

### F. Assignments

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/assignments` | Список заданий курса (filter: status) | course member |
| POST | `/courses/{id}/assignments` | Создать (черновик / publish) | owner / co_owner |
| GET | `/assignments/{id}` | Деталь (flat lookup) | course member |
| PATCH | `/assignments/{id}` | Обновить | owner / co_owner |
| DELETE | `/assignments/{id}` | Soft delete | owner / co_owner |
| POST | `/assignments/{id}:publish` | Перевести `draft → published` | owner / co_owner |
| POST | `/assignments/{id}:archive` | Архивировать | owner / co_owner |
| POST | `/assignments/{id}:duplicate` | Скопировать в этот же или другой курс (`{ "target_course_id": ... }`) | owner / co_owner |

**`POST /courses/{id}/assignments`**
```json
{
  "slug": "lab-1-sort",
  "title": "Лаба 1: сортировка",
  "description": "Markdown условие задания",
  "language_hint": "python",
  "max_score": 10,
  "weight": 1.0,
  "deadline_soft_at": "2026-03-10T23:59:00+03:00",
  "deadline_hard_at": "2026-03-17T23:59:00+03:00",
  "late_score_multiplier": 0.5,
  "selection_strategy": "best",
  "plagiarism_auto_run": true,
  "plagiarism_threshold": 0.6,
  "ai_auto_run": true,
  "ai_prompt_version": null,
  "external_bindings": [{ "system": "stepik", "external_assignment_id": "step_123" }]
}
```

### G. Deadlines

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/assignments/{id}/deadlines` | `{ deadline_soft_at, deadline_hard_at, late_score_multiplier }` | course member |
| PATCH | `/assignments/{id}/deadlines` | Обновить (отправляет `course.assignment.deadline_changed.v1`) | owner / co_owner |
| GET | `/assignments/{id}/deadlines/effective-for/{user_id}` | Эффективный дедлайн (с учётом индивидуальных продлений) | course member / self |
| POST | `/assignments/{id}/deadline-extensions` | Продление дедлайна одному студенту (`{user_id, deadline_soft_at, deadline_hard_at, reason}`) | owner / co_owner |
| GET | `/assignments/{id}/deadline-extensions` | Список продлений | owner / co_owner / assistant |
| DELETE | `/assignments/{id}/deadline-extensions/{ext_id}` | Отменить продление | owner / co_owner |

### H. Grading config

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/assignments/{id}/grading-config` | rubric, pass_threshold, visibility_at | course member |
| PATCH | `/assignments/{id}/grading-config` | Обновить | owner / co_owner |
| GET | `/assignments/{id}/grading-config/rubric` | Только рубрика | course member |
| PATCH | `/assignments/{id}/grading-config/rubric` | Только рубрика | owner / co_owner |

### I. Assignment statistics (кросс-чтение посылок, proxy в Submission/Reporting)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/assignments/{id}/stats` | `{ submissions_count, students_submitted, average_score, plagiarism_alerts, ai_runs }` | owner / co_owner / assistant |
| GET | `/assignments/{id}/stats/timeline` | Распределение посылок по дням | owner / co_owner / assistant |

### J. Course discovery (для студента)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users/me/courses` | Курсы, в которых я участвую | bearer |
| GET | `/users/me/courses/{course_id}/assignments` | Видимые задания (только published) | bearer + member |
| GET | `/users/me/assignments` | Плоский список своих видимых заданий по всем курсам | bearer |
| GET | `/users/me/assignments/upcoming` | С приближающимися дедлайнами | bearer |

### K. Health

`GET /healthz`, `/readyz`, `/metrics`, `/v1/version`.

## События, которые публикует Course Service

См. `03-EVENTS.md`, секция Course.

## События, на которые подписан Course Service

- `identity.user.deleted.v1` → удаляет user из всех `CourseMember`, переназначает owner если совпадает
- `identity.user.anonymized.v1` → обновляет денорм-поля
- `identity.tenant.deleted.v1` → каскадно архивирует все курсы тенанта

## Метрики (специфичные)

- `course_courses_total{tenant_id, status}` (gauge)
- `course_assignments_total{tenant_id, status}`
- `course_members_per_course` (histogram)
- `course_deadline_extensions_total{reason}`

## Реализация: критичные моменты

1. **Композиция авторизации**: для каждого запроса с course-scoped ресурсом помощник `plaglens-rbac` подгружает course role из локальной таблицы (не из JWT — для гарантии актуальности).
2. **Идемпотентность создания**: `Idempotency-Key` для POST `/courses`, `/assignments`, `:joinByCode`.
3. **Soft delete каскад**: при `DELETE /courses/{id}` все assignments soft-deleted; submissions помечаются деацивированными (логика в Submission Service по событию).
4. **Дедлайн effective-for**: алгоритм — взять глобальный дедлайн задания, наложить продления per-user (если есть), вернуть результат.
5. **Selection strategy**: при `last` — выбираем submission с максимальным `submitted_at`; `best` — с максимальной оценкой / score (fallback на `last` если оценки нет); `manual` — берётся submission, помеченный `:select` в Submission Service.
6. **`external_bindings` валидация**: при создании задания, если указан Stepik step_id — Course Service вызывает Integration Service GET `/integrations/stepik/steps/{step_id}/validate`, чтобы убедиться, что у тенанта есть права читать этот step.
