# Submission Service

> Хранит все версии посылок, их файлы (в MinIO), оценки и комментарии преподавателей. Выделен в отдельный сервис из-за объёма данных и плотности операций (массовый импорт, постоянное чтение для проверок).

**База URL префикс:** `/api/v1`

## Сущности

```
Submission
  id, tenant_id, course_id, assignment_id, author_id, version (per author per assignment),
  source (manual/stepik/yandex_contest/api),
  external_id (nullable, unique per (source, tenant)),
  external_url (nullable),
  language, content_hash (sha256), total_size_bytes,
  submitted_at, imported_at,
  external_verdict (nullable: ok/wa/tle/ce/...), external_score (nullable),
  is_late (bool, computed), late_kind (null/soft/hard),
  status (received/processing/ready/error),
  flags (JSON: { suspicious: bool, llm_attention: bool, manually_flagged: bool, ... }),
  selected_for_grading (bool), selected_at,
  deleted_at

SubmissionFile
  id, submission_id, path, size_bytes, mime_type, content_hash,
  storage_uri (s3://plaglens-{tenant}/submissions/{submission_id}/{file_id})

SubmissionGrade
  submission_id (PK), score, max_score, applied_multiplier (1.0 / late_multiplier),
  graded_by, graded_at, comment_visible_to_student (bool), updated_at, history (JSONL — append-only audit)

SubmissionFeedback
  id, submission_id, author_id (teacher),
  body (markdown), visible_to_student (bool),
  source (manual/llm_curated),  # manual = вручную, llm_curated = взято из LLM-отчёта и отредактировано
  created_at, updated_at

SubmissionFlag
  id, submission_id, kind (suspicious/llm_attention/manual),
  set_by (user/system), reason, created_at, cleared_at
```

## Эндпоинты

### A. Submissions — read

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/assignments/{id}/submissions` | Список посылок задания (filter: author_id, status, version, late, suspicious, language, sort) | course teacher / assistant |
| GET | `/assignments/{id}/submissions/latest-per-student` | По одной (последней) посылке на каждого студента | teacher / assistant |
| GET | `/assignments/{id}/submissions/best-per-student` | По одной (лучшей по оценке) на каждого | teacher / assistant |
| GET | `/assignments/{id}/submissions/selected-per-student` | Выбранные для оценки (по `selected_for_grading`) | teacher / assistant |
| GET | `/submissions/{id}` | Деталь | teacher / assistant / self |
| GET | `/submissions/{id}/files` | Список файлов | teacher / assistant / self |
| GET | `/submissions/{id}/files/{file_id}` | Метаданные файла | teacher / assistant / self |
| GET | `/submissions/{id}/files/{file_id}/content` | Сам код (text/plain или binary) | teacher / assistant / self |
| GET | `/submissions/{id}/files/{file_id}/content?as=highlighted` | Подсветка синтаксиса (HTML) | teacher / assistant / self |
| GET | `/submissions/{id}/diff?against={other_submission_id}` | Дифф против другой посылки (для пар плагиата) | teacher / assistant |
| GET | `/submissions/{id}/history` | Все версии этого автора по этому заданию | teacher / assistant / self |

**Filters для list:**
```
?author_id=usr_42&status=ready&late=true&suspicious=true&language=python
&min_score=5&max_score=10&sort=-submitted_at&cursor=...&limit=50
```

### B. Submissions — write

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/assignments/{id}/submissions` | Ручная загрузка (multipart: files + metadata) | teacher / assistant / student (своя) |
| POST | `/assignments/{id}/submissions:batchCreate` | Массовая загрузка (zip с подкаталогами per-author) | teacher / assistant |
| DELETE | `/submissions/{id}` | Soft delete | teacher / owner / co_owner |
| POST | `/submissions/{id}:select` | Пометить как выбранную для оценки | teacher / assistant |
| POST | `/submissions/{id}:unselect` | Снять | teacher / assistant |
| POST | `/submissions/{id}:flag` | Поставить флаг (`{ kind, reason }`) | teacher / assistant |
| POST | `/submissions/{id}:unflag` | Снять | teacher / assistant |
| POST | `/submissions/{id}:rerun-checks` | Переотправить на plagiarism + AI | teacher / assistant |

**`POST /assignments/{id}/submissions` (manual upload)**
```
Content-Type: multipart/form-data

fields:
  author_id (string, optional — по умолчанию текущий юзер если он student)
  language (string)
  source (string, default "manual")
  files[] (binary)
  description (string, optional)
  external_url (optional)
```

Логика:
1. Сохраняет файлы в MinIO.
2. Считает `content_hash`.
3. Дедуп: если для (`assignment_id`, `author_id`, `content_hash`) уже есть submission — возвращает 200 с тем же id и не создаёт новую версию.
4. Иначе — создаёт `version = max(version) + 1`.
5. Эмитит `submission.submission.created.v1`.

### C. Grading

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/submissions/{id}/grade` | Текущая оценка | teacher / assistant / self (если visible_to_student=true) |
| POST | `/submissions/{id}/grade` | Выставить (`{score, comment_visible_to_student?}`) | teacher / assistant |
| PATCH | `/submissions/{id}/grade` | Обновить | teacher / assistant |
| DELETE | `/submissions/{id}/grade` | Снять | teacher |
| GET | `/submissions/{id}/grade/history` | История изменений | teacher / assistant / self |

**`POST /submissions/{id}/grade`**
```json
{ "score": 8.5, "comment_visible_to_student": true }
```
- Сервер сам высчитывает `applied_multiplier` (1.0 если submission не late, иначе `assignment.late_score_multiplier`).
- Если `assignment.deadline_hard_at < submitted_at` — `score = 0` принудительно (не зачитывается, см. C5 КТ-1).

### D. Feedback (комментарии)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/submissions/{id}/feedback` | Список комментариев (filter: visible_to_student) | teacher / assistant / self (visible only) |
| POST | `/submissions/{id}/feedback` | Создать (`{body, visible_to_student}`) | teacher / assistant |
| GET | `/submissions/{id}/feedback/{fb_id}` | Деталь | teacher / assistant / self |
| PATCH | `/submissions/{id}/feedback/{fb_id}` | Изменить | автор / teacher (owner) |
| DELETE | `/submissions/{id}/feedback/{fb_id}` | Удалить | автор / teacher (owner) |
| POST | `/submissions/{id}/feedback/{fb_id}:publish` | Сделать видимым студенту | автор / teacher |
| POST | `/submissions/{id}/feedback/{fb_id}:unpublish` | Скрыть | автор / teacher |
| POST | `/submissions/{id}/feedback:from-llm` | Создать из LLM-отчёта (внутренний flow: preview → save) `{ ai_analysis_id, edited_body, visible_to_student }` | teacher / assistant |

### E. Flags (подозрительность)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/submissions/{id}/flags` | Список флагов | teacher / assistant |
| GET | `/courses/{id}/flagged-submissions` | Все подозрительные посылки курса | teacher / assistant |
| GET | `/assignments/{id}/flagged-submissions` | По заданию | teacher / assistant |
| POST | `/submissions/{id}/flags` | Поставить (`{kind, reason}`) | teacher / assistant |
| DELETE | `/submissions/{id}/flags/{flag_id}` | Снять | teacher / assistant |

### F. Student-side (self-service)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users/me/assignments/{id}/submissions` | Мои посылки по заданию | bearer |
| GET | `/users/me/submissions` | Все мои посылки (filter: course_id, assignment_id, language) | bearer |
| GET | `/users/me/submissions/{id}` | Моя посылка | bearer (только если author_id == self) |
| GET | `/users/me/submissions/{id}/grade` | Моя оценка (видна только если grading visible_to_students_at прошёл) | bearer |
| GET | `/users/me/submissions/{id}/feedback` | Видимый мне фидбек | bearer |
| GET | `/users/me/submissions/{id}/plagiarism` | Мой % сходства (только агрегированный) | bearer |
| GET | `/users/me/submissions/{id}/ai` | Мой LLM-комментарий, если расшарен | bearer |

### G. Bulk operations

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/assignments/{id}/submissions:batchCreate` | Bulk import (см. выше) | teacher / assistant |
| POST | `/assignments/{id}/grades:batchUpdate` | Массовое выставление оценок (CSV / JSON список `{submission_id, score, comment_visible_to_student}`) | teacher / assistant |
| POST | `/assignments/{id}/feedback:batchPublish` | Массовая публикация фидбека (`{ submission_ids: [...] }`) | teacher / assistant |
| POST | `/assignments/{id}/submissions:batchSelect` | Массовая разметка selected (`{ rule: "best" / "last" / "by_id", ids: [...] }`) | teacher / assistant |

(Все batch-эндпоинты возвращают `202` + Operation, статус — стандартный.)

### H. Health

`GET /healthz`, `/readyz`, `/metrics`, `/v1/version`.

## События, которые публикует Submission Service

См. `03-EVENTS.md`, секция Submission.

## События, на которые подписан Submission Service

- `integration.import.completed.v1` → создаёт submissions из импортированных данных (если import service кладёт raw в S3, это другая модель — но в нашей архитектуре Integration Service напрямую POSTит в Submission Service)
- `course.assignment.deleted.v1` → soft-deactivate всех submissions
- `identity.user.anonymized.v1` → обнуляет `author_id` (заменяет на `anon_id`), сохраняет код для статистики
- `identity.user.deleted.v1` → soft-delete submissions; ретеншн настраивается тенантом
- `plagiarism.run.completed.v1` → ставит / снимает `flags.suspicious` на основе результата
- `ai.analysis.completed.v1` → ставит `flags.llm_attention` если в отчёте есть `risk_signals` с `severity >= medium`

## Метрики (специфичные)

- `submissions_total{tenant_id, source}` (counter, увеличивается при создании)
- `submissions_per_assignment` (histogram)
- `submissions_late_total{kind}` (`soft` / `hard`)
- `submissions_storage_bytes{tenant_id}` (gauge)
- `submissions_dedup_skips_total{source}`
- `grading_actions_total{action}` (`assigned` / `changed` / `removed`)

## Реализация: критичные моменты

1. **Все версии хранятся** (по C6). Никогда не удаляем `version<N` при появлении `version=N`.
2. **Selection_for_grading** — поведение зависит от `assignment.selection_strategy`:
    - `last`: автоматически переключается на новую версию при каждом import; `selected_at` обновляется.
    - `best`: пересчитывается при появлении новой оценки.
    - `manual`: только через `:select`.
3. **Late detection**: вычисляется в момент INSERT'а на основе `assignment.deadline_*` и `submission.submitted_at` (внешняя метка времени из источника, fallback на `imported_at`).
4. **Storage layout** в MinIO:
   ```
   plaglens-{tenant_slug}/
     submissions/{yyyy}/{mm}/{dd}/sub_{id}/
       file_{file_id}_{filename}
   ```
   Для архивов (zip) — распаковываем при upload, сохраняем плоский tree.
5. **Дедупликация**: при импорте по `(source, external_submission_id)` или по `(assignment_id, author_id, content_hash)` — повторно загружаемая посылка не создаёт дубль, возвращает существующую.
6. **Late `score = 0` после hard deadline** — это бизнес-правило, реализуется при выставлении оценки. UI рекомендуется показывать предупреждение при попытке.
7. **`comment_visible_to_student` и `visibility_at` (assignment-level)** — двухуровневая видимость: фидбек становится виден ТОЛЬКО если оба условия — `visible_to_student=true` И `now >= grading_config.visible_to_students_at`.
8. **Большие файлы**: лимит 10 МБ на файл, 50 МБ на zip — стандарт. Исключение для языков с heavy resources (assembly + binary deps) — опционально per-tenant.
