# Plagiarism Service

> Оркестрирует проверки на заимствования через внешний сервис. Хранит результаты как aggregated metrics + ссылки на сырые артефакты. **Без эталонных решений** (по C7). **С глобальным cross-course корпусом** (по E5). Pluggable provider'ы — JPlag (default), MOSS, Codequiry, Dolos.

**База URL префикс:** `/api/v1`

## Архитектура внутри сервиса

```
plaglens-plagiarism/
  providers/
    base.py        # PlagiarismProvider ABC
    jplag.py       # subprocess Java + parse JSON output
    moss.py        # perl protocol → HTML URL
    dolos.py       # subprocess + CSV
    codequiry.py   # HTTP polling
  orchestrator.py  # очередь, ретраи, prebuild submission set
  corpus.py        # инкрементальный fingerprint index для cross-course
  reports.py       # нормализация в общую модель + сохранение
  webhooks.py      # эмуляция webhook'а наружу (наш API → клиент)
```

`PlagiarismProvider` интерфейс (по research'у агента):
```python
class PlagiarismProvider(Protocol):
    name: str
    capabilities: ProviderCapabilities  # languages, max_size, has_native_clusters

    async def submit(self, submission_set: SubmissionSet) -> ProviderRunId: ...
    async def poll(self, run_id: ProviderRunId) -> ProviderResult: ...
    async def cancel(self, run_id: ProviderRunId) -> None: ...
    async def fetch_artifact(self, run_id: ProviderRunId, kind: str) -> bytes: ...
```

## Сущности

```
PlagiarismRun
  id, tenant_id, course_id, assignment_id (nullable: corpus run = null assignment),
  provider, provider_run_id (external id),
  scope (JSON: { assignment_ids[], with_corpus: bool, baseline_kind?, since? }),
  trigger (manual/auto_after_import/scheduled),
  status (queued/running/completed/failed/cancelled),
  started_at, finished_at,
  options (JSON: { min_tokens, threshold, ... }),
  submissions_count, pairs_total, pairs_suspected, max_similarity,
  artifact_html_uri, artifact_json_uri, artifact_archive_uri,
  triggered_by, error (JSON: Problem nullable),
  created_at

PlagiarismPair
  id, run_id, a_submission_id, b_submission_id, similarity (float 0..1),
  matched_tokens, fragments (JSONB: [{a_file, a_start, a_end, b_file, b_start, b_end}]),
  cross_course (bool), cross_assignment (bool), cross_tenant (bool, всегда false для теперь)

PlagiarismCluster  (опционально, если provider возвращает)
  id, run_id, members (submission_id[]), avg_similarity, dominant_language

CorpusEntry  (для cross-course проверок)
  id, tenant_id, course_id, assignment_id, submission_id, language, fingerprints (BYTEA),
  added_at, deleted_at  -- soft removal при удалении submission

ProviderConfig  (admin)
  tenant_id, provider, enabled, default_for_tenant, settings (JSON), credentials_secret_ref

SuspiciousFlag  (отдельно от Submission.flags для удобства фильтрации)
  id, submission_id, run_id, reason ("similarity_above_threshold" / "manual"),
  similarity, paired_with[], severity (low/medium/high), created_at, cleared_at, cleared_by
```

## Эндпоинты

### A. Запуск проверок (Runs)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/assignments/{id}/plagiarism-runs` | Запустить проверку (`{ provider?, with_corpus?, options? }`) | teacher / assistant |
| GET | `/assignments/{id}/plagiarism-runs` | Список запусков | teacher / assistant |
| GET | `/plagiarism-runs/{id}` | Деталь run | teacher / assistant |
| POST | `/plagiarism-runs/{id}:cancel` | Отменить | teacher / assistant |
| POST | `/plagiarism-runs/{id}:retry` | Перезапустить упавший с тем же scope | teacher / assistant |
| DELETE | `/plagiarism-runs/{id}` | Soft delete (артефакты остаются 30 дней) | teacher / owner |
| GET | `/courses/{id}/plagiarism-runs` | Все runs курса | teacher / assistant |

**`POST /assignments/{id}/plagiarism-runs`**
```json
{
  "provider": "jplag",                   // optional, default — tenant default
  "with_corpus": true,                   // включить cross-course
  "options": {
    "min_tokens": 9,
    "similarity_threshold": 0.6,         // для suspicious flagging
    "include_versions": "selected",      // "selected" | "all_versions" | "latest_per_student"
    "languages_filter": ["python"]
  }
}
```
Возвращает 202 Accepted + Operation. Идемпотентность по `Idempotency-Key`. Эмитит `plagiarism.run.queued.v1`.

### B. Reports

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/plagiarism-runs/{id}/report` | Aggregate report | teacher / assistant |
| GET | `/plagiarism-runs/{id}/pairs` | Список пар (filter: min_similarity, cross_course, sort) | teacher / assistant |
| GET | `/plagiarism-runs/{id}/pairs/{pair_id}` | Деталь пары | teacher / assistant |
| GET | `/plagiarism-runs/{id}/pairs/{pair_id}/diff` | Side-by-side diff с подсветкой fragments | teacher / assistant |
| GET | `/plagiarism-runs/{id}/clusters` | Кластеры (если provider дал) | teacher / assistant |
| GET | `/plagiarism-runs/{id}/clusters/{cluster_id}` | Детали кластера | teacher / assistant |
| GET | `/plagiarism-runs/{id}/artifacts/html` | Сырой HTML-отчёт от провайдера | teacher / assistant |
| GET | `/plagiarism-runs/{id}/artifacts/json` | Сырой JSON-отчёт | teacher / assistant |
| GET | `/plagiarism-runs/{id}/artifacts/archive` | Полный zip-архив (для скачивания) | teacher / assistant |

**`GET /plagiarism-runs/{id}/report`** (response):
```json
{
  "run_id": "plg_8b7c1f2d",
  "assignment_id": "asn_42",
  "provider": "jplag",
  "status": "completed",
  "submissions_count": 87,
  "summary": {
    "max_similarity": 0.94,
    "mean_similarity": 0.18,
    "pairs_total": 3741,
    "pairs_suspected": 12,
    "clusters_count": 3,
    "languages": { "python": 87 }
  },
  "started_at": "...",
  "finished_at": "...",
  "options_used": { ... },
  "artifacts": {
    "html_url": "/v1/plagiarism-runs/plg_.../artifacts/html",
    "json_url": "/v1/plagiarism-runs/plg_.../artifacts/json"
  }
}
```

**`GET /plagiarism-runs/{id}/pairs`** — стандартная list с пагинацией:
```json
{
  "data": [
    {
      "id": "pair_001",
      "a_submission_id": "sub_1001",
      "b_submission_id": "sub_1008",
      "a_author": { "id": "usr_42", "display_name": "..." },
      "b_author": { "id": "usr_77", "display_name": "..." },
      "similarity": 0.82,
      "matched_tokens": 412,
      "fragments_count": 3,
      "cross_course": false,
      "cross_assignment": false,
      "evidence_url": "/v1/plagiarism-runs/plg_.../pairs/pair_001"
    }
  ],
  "pagination": { ... }
}
```

**`GET /plagiarism-runs/{id}/pairs/{pair_id}`** — full detail с массивом fragments:
```json
{
  "id": "pair_001",
  "similarity": 0.82,
  "fragments": [
    {
      "a_file": "main.py", "a_start_line": 10, "a_end_line": 35,
      "b_file": "solution.py", "b_start_line": 12, "b_end_line": 37,
      "a_content": "...", "b_content": "..."
    }
  ],
  "submissions": { "a": { ... }, "b": { ... } }
}
```

### C. Per-submission view

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/submissions/{id}/plagiarism` | Latest plagiarism report для этой посылки (агрегат) | teacher / assistant |
| GET | `/submissions/{id}/plagiarism/runs` | Все runs, в которых эта посылка участвовала | teacher / assistant |
| GET | `/submissions/{id}/plagiarism/pairs` | Пары, где эта посылка — один из членов | teacher / assistant |
| GET | `/submissions/{id}/plagiarism/percentage` | **Только % (для студента)** | self (только своя) |

Last endpoint:
```json
{
  "submission_id": "sub_8b7c",
  "max_similarity_with_others": 0.41,
  "checked_at": "2026-05-01T10:23:45Z",
  "flagged": false
}
```
(Студент **не получает** информацию о парах, fragments, об именах других студентов.)

### D. Cross-course corpus (E5)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/plagiarism-corpus` | Стат-ка корпуса тенанта | admin |
| GET | `/plagiarism-corpus/courses/{course_id}` | По курсу | owner / co_owner |
| POST | `/plagiarism-corpus:rebuild` | Перестроить fingerprint index (admin) | admin |
| POST | `/plagiarism-corpus/search` | Поиск похожих посылок в корпусе для произвольной посылки (`{submission_id}`) | teacher / assistant |
| DELETE | `/plagiarism-corpus/entries/{entry_id}` | Удалить запись из корпуса (например при анонимизации) | admin |

Как работает:
- При каждом `submission.created.v1` Plagiarism Service строит fingerprint этой посылки и добавляет в `CorpusEntry`.
- При запуске `with_corpus: true` — submission set расширяется кандидатами из `CorpusEntry` тенанта (с тем же `language`).

### E. Suspicious flagging (E10)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/suspicious-submissions` | Все подозрительные в курсе | teacher / assistant |
| GET | `/assignments/{id}/suspicious-submissions` | По заданию | teacher / assistant |
| GET | `/submissions/{id}/suspicious-flags` | Все flag'и подозрительности | teacher / assistant |
| POST | `/submissions/{id}/suspicious-flags` | Поставить вручную (`{reason, severity}`) | teacher / assistant |
| DELETE | `/submissions/{id}/suspicious-flags/{flag_id}` | Снять | teacher / assistant |
| POST | `/submissions/{id}/suspicious-flags/{flag_id}:dismiss` | Подтвердить «не подозрительно» (с reason) | teacher / assistant |

(Автоматический flag — добавляется на основе `plagiarism.suspicious_pair.flagged.v1` событий, когда similarity > `assignment.plagiarism_threshold`.)

### F. Provider management (admin)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/plagiarism/providers` | Список доступных провайдеров и их capabilities | admin |
| GET | `/admin/plagiarism/providers/{provider}` | Конкретный | admin |
| PATCH | `/admin/plagiarism/providers/{provider}` | Включить/отключить, обновить settings | admin |
| POST | `/admin/plagiarism/providers/{provider}:test` | Проверить, что credentials валидны | admin |
| POST | `/admin/plagiarism/providers/{provider}:set-default` | Сделать дефолтом для тенанта | admin |
| GET | `/admin/plagiarism/providers/{provider}/usage` | Статистика использования (число runs, среднее время) | admin |

### G. Run options и threshold (per-assignment)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/assignments/{id}/plagiarism-config` | `{ provider, threshold, auto_run, with_corpus, languages_filter, ... }` | teacher / assistant |
| PATCH | `/assignments/{id}/plagiarism-config` | Обновить | owner / co_owner |

### H. Webhooks (входящие — от провайдеров если поддерживают, и outgoing — для клиентов нашего API)

Входящие (если провайдер поддерживает; сейчас все 4 — polling-only, но архитектурно готовы):
- `POST /webhooks/plagiarism/{provider}/{run_id}` — см. `07-INTEGRATION.md`.

Исходящие — клиенты PlagLens могут подписаться на события от наших API:
| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/admin/plagiarism/webhook-subscriptions` | Подписать URL на события (HMAC-secret) | admin |
| GET | `/admin/plagiarism/webhook-subscriptions` | Список | admin |
| DELETE | `/admin/plagiarism/webhook-subscriptions/{id}` | Удалить | admin |

(Это для интеграции с внешними системами тенанта типа LMS университета.)

### I. Health

`GET /healthz`, `/readyz`, `/metrics`, `/v1/version`.

## События, которые публикует Plagiarism Service

См. `03-EVENTS.md`, секция Plagiarism.

## События, на которые подписан Plagiarism Service

- `submission.submission.created.v1` → добавляет `CorpusEntry` (для cross-course)
- `course.assignment.created.v1` → если `assignment.plagiarism_auto_run=true` — настраивает автозапуск
- `integration.import.completed.v1` → если у задания `plagiarism_auto_run=true`, и пришло >N новых посылок, ставит run в очередь
- `submission.submission.deleted.v1` → soft-deactivate `CorpusEntry`
- `identity.user.anonymized.v1` → обновляет денорм-поля в pairs (display_name → "[anonymized]")

## Метрики (специфичные)

- `plagiarism_runs_total{provider, status}`
- `plagiarism_runs_duration_seconds{provider}` (histogram)
- `plagiarism_pairs_total` (counter)
- `plagiarism_pairs_suspected_total` (counter)
- `plagiarism_corpus_entries{tenant_id, language}` (gauge)
- `plagiarism_external_api_errors_total{provider, error_type}`
- `plagiarism_provider_quota_remaining{provider}` (gauge — для MOSS, Codequiry)

## Реализация: критичные моменты

1. **Polling-only от провайдеров** (по research). Worker'ы в Celery с очередью `plagiarism`, опрашивают provider каждые 5–60s в зависимости от capabilities. Status экспортится через наш Operation API.
2. **JPlag-default**: в Docker-образе сервиса предустановлена JRE + jplag.jar (фикс. версия). Запускается как subprocess с `-r` в tmp-папку, потом парсится `.jplag` zip.
3. **MOSS** — использует stanford-mossnet через perl-клиент. Возвращает только URL. Мы скачиваем HTML-страницы и парсим в наши `pairs`.
4. **Codequiry** — HTTP-провайдер с 4-step flow (см. research): create → upload → start → poll status → fetch results.
5. **Dolos** — subprocess CLI (`dolos run -f csv -l <lang>`), читаем CSV.
6. **Submission set preparation**: до отправки внешнему сервису:
    - Берём submissions согласно `options.include_versions`
    - Удаляем boilerplate (если задано в `assignment.plagiarism_config.strip_patterns`)
    - Группируем по language; если задание много-языковое — разбиваем на несколько runs
7. **Cross-course (corpus)**: `CorpusEntry` хранит fingerprints (winnowing — сами шинглы). Для каждой новой submission ставим в индекс. При run with corpus — выбираем top-N кандидатов из corpus по grosse-similarity и добавляем их к submission set перед отправкой external'у.
    - Если корпус большой — добавляем не все, а top-K (configurable).
8. **Идемпотентность**: `(assignment_id, scope_hash, options_hash)` → если pending run уже есть, возвращаем existing.
9. **Quota limits**: для MOSS (100 запросов/день) — circuit breaker; failover на JPlag automatically.
10. **Артефакты в MinIO**: `plaglens-{tenant}/plagiarism/{run_id}/{html|json|archive}.{ext}` с public-read=false; доступ через signed URL TTL 5 мин.
11. **Cross-tenant изоляция корпуса**: `CorpusEntry` фильтруется строго по `tenant_id`. **Никогда** не смешиваются.
12. **Suspicious flag** ставится автоматически на оба submission'а пары, если `similarity > assignment.plagiarism_threshold`. Severity: `< 0.7` low, `0.7–0.85` medium, `> 0.85` high.
13. **Retry policy**: на failed run — экспоненциальный backoff (30s, 2m, 10m), max 3 попыток. После — DLQ.
14. **Cancel**: посылает cancel в provider (если поддерживает), обновляет run status, эмитит событие.
