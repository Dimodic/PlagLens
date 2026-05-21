# PlagLens AI Analysis Service

LLM-powered code review for student submissions. Spec: `docs/architecture/legacy/09-AI-ANALYSIS.md`.

## Stack
- Python 3.12+, FastAPI, Pydantic v2
- SQLAlchemy 2.x async + asyncpg + Alembic (schema `ai_analysis`)
- redis-py async, aiokafka, structlog, httpx
- `openai>=1.30` (works with any OpenAI-compatible endpoint), `tiktoken`

## Entry points
- `uvicorn ai_analysis_service.main:app --host 0.0.0.0 --port 8080`
- `alembic upgrade head`
- `pytest -q`

## Environment

Key settings (see `src/ai_analysis_service/config.py`):
- `DATABASE_URL`, `DATABASE_SCHEMA=ai_analysis`
- `REDIS_URL`, `KAFKA_BROKERS`, `KAFKA_DISABLED`, `AUTH_DISABLED`
- `DEFAULT_PROVIDER=openai`, `DEFAULT_MODEL=gpt-4o-mini`
- `OPENAI_API_KEY_PATH` (file with token; alternative: `OPENAI_API_KEY`)
- `MAX_PROMPT_TOKENS=8000`, `MAX_COMPLETION_TOKENS=2000`
- `SUBMISSION_SERVICE_URL=http://submission-service:8080`
- `LLM_TIMEOUT_S=60`, `FAILOVER_THRESHOLD=3`

## Design highlights
- OpenAI-compatible base client (`AsyncOpenAI(base_url=...)`) — works with OpenAI, vLLM, llama.cpp, Yandex GPT/GigaChat through proxy.
- Prompt-injection defense: `<student_code>` wrapping + system-prompt clause + post-response sanity check.
- Cache key: `sha256(model + prompt_version + code_hash + language)`. Hits emit `ai.analysis.cache_hit.v1` and never call the LLM.
- Budgets: tenant + course rolling counters in PG with pre-check (returns 429 `BUDGET_EXCEEDED`) and post-update.
- Failover: 429/5xx ≥ N consecutive → switch to next provider by `priority`.
- Regenerate: new `AIAnalysis` row with `parent_analysis_id` (preview-only until curate).
- Curate-as-feedback: HTTP call to Submission Service `/api/v1/submissions/{id}/feedback:from-llm`.

## Endpoints (≥30)
See `docs/architecture/legacy/09-AI-ANALYSIS.md` (sections A through I).

## Tests
Mocked OpenAI responses through `respx`, fakeredis, in-memory aiosqlite, no Kafka in tests.
