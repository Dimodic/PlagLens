"""Core orchestrator: cache → budget → provider failover → persist → emit."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.events import build_event
from ..common.ids import gen_id
from ..common.metrics import (
    ai_analyses_duration_seconds,
    ai_analyses_total,
    ai_cache_hits_total,
    ai_cost_total,
    ai_prompt_injection_detected_total,
    ai_provider_failovers_total,
    ai_tokens_used_total,
)
from ..config import get_settings
from ..events.producer import EventPublisher
from ..models import AIAnalysis, ProviderConfig
from ..providers.base import (
    AnalysisResult,
    OpenAICompatibleProvider,
    ProviderCapabilities,
    ProviderError,
    estimate_cost,
)
from ..schemas import PlagLensReport
from .budgets import (
    BudgetService,
    make_exceeded_event,
    make_warning_event,
    warning_should_fire,
)
from .cache import AnalysisCache, build_cache_key
from .sanitizer import is_injection_suspected, wrap_student_code
from .submission_client import SubmissionClient

logger = logging.getLogger(__name__)


@dataclass
class AnalysisRequest:
    tenant_id: str
    course_id: str | None
    assignment_id: str | None
    submission_id: str
    code: str
    language: str
    course_name: str = ""
    assignment_title: str = ""
    # The task statement / problem condition. Passing it lets the LLM
    # judge whether the code actually solves *this* task, not just
    # whether it compiles — without it the model is guessing.
    assignment_description: str = ""
    prompt_version: str | None = None
    provider: str | None = None
    force_no_cache: bool = False
    trigger: str = "manual"
    actor_id: str | None = None
    parent_analysis_id: str | None = None


@dataclass
class PromptBundle:
    id: str
    system_prompt: str
    user_template: str
    json_schema: dict[str, Any]


class ProviderFactory:
    """Builds OpenAI-compat clients from ProviderConfig rows.

    Tests inject a ``client_factory`` to swap the underlying ``AsyncOpenAI``
    for a mocked one (e.g. driven by ``respx``).
    """

    def __init__(
        self,
        client_factory: Any | None = None,
        max_completion_tokens: int | None = None,
    ) -> None:
        self.client_factory = client_factory
        s = get_settings()
        self.max_completion_tokens = (
            max_completion_tokens or s.MAX_COMPLETION_TOKENS
        )
        self.timeout_s = s.LLM_TIMEOUT_S

    def build(self, cfg: ProviderConfig, api_key: str | None) -> OpenAICompatibleProvider:
        client = None
        if self.client_factory is not None:
            client = self.client_factory(cfg=cfg, api_key=api_key)
        capabilities = ProviderCapabilities(
            supports_json_schema=bool(cfg.supports_json_schema),
            max_context=int(cfg.max_tokens) if cfg.max_tokens else 32000,
        )
        settings_dict = cfg.settings or {}
        pricing = settings_dict.get("pricing") if settings_dict else None
        # OpenRouter convention: send HTTP-Referer + X-Title for app attribution.
        # Configurable per-provider via ``settings.headers`` (override-friendly);
        # falls back to global Settings when the host matches openrouter.ai.
        s = get_settings()
        extra_headers: dict[str, str] = {}
        cfg_headers = (settings_dict.get("headers") or {}) if settings_dict else {}
        if isinstance(cfg_headers, dict):
            extra_headers.update({str(k): str(v) for k, v in cfg_headers.items()})
        if "openrouter.ai" in (cfg.base_url or "").lower():
            extra_headers.setdefault("HTTP-Referer", s.OPENROUTER_HTTP_REFERER)
            extra_headers.setdefault("X-Title", s.OPENROUTER_X_TITLE)
        temperature = float(
            settings_dict.get("temperature", s.LLM_DEFAULT_TEMPERATURE)
            if settings_dict else s.LLM_DEFAULT_TEMPERATURE
        )
        return OpenAICompatibleProvider(
            name=cfg.provider,
            base_url=cfg.base_url,
            api_key=api_key,
            model=cfg.model,
            capabilities=capabilities,
            max_completion_tokens=self.max_completion_tokens,
            timeout_s=self.timeout_s,
            pricing=pricing,
            client=client,
            extra_headers=extra_headers or None,
            retry_backoffs=s.retry_backoffs_resolved,
            temperature=temperature,
        )


class Orchestrator:
    def __init__(
        self,
        *,
        session: AsyncSession,
        cache: AnalysisCache,
        publisher: EventPublisher,
        provider_factory: ProviderFactory,
        prompt_loader: Any,
    ) -> None:
        self.session = session
        self.cache = cache
        self.publisher = publisher
        self.provider_factory = provider_factory
        self.prompt_loader = prompt_loader
        self.settings = get_settings()
        self._failover_threshold = self.settings.FAILOVER_THRESHOLD

    # --------------------------- Entry point --------------------------------

    async def run_analysis(self, req: AnalysisRequest) -> AIAnalysis:
        # Code fallback. Callers *should* pass ``code``, but the batch
        # endpoint passes "" and a manual run can fire before the
        # frontend's file-content query resolves — either way the LLM
        # would get an empty <student_code> block and conclude "код не
        # представлен". Fetch the source ourselves before anything
        # downstream (cache key, prompt) consumes it.
        if not (req.code or "").strip() and req.submission_id:
            try:
                fetched = await SubmissionClient().fetch_submission_code(
                    req.submission_id, tenant_id=req.tenant_id
                )
            except Exception as exc:  # noqa: BLE001 — best-effort fallback
                logger.warning(
                    "code fallback fetch failed for %s: %s",
                    req.submission_id,
                    exc,
                )
                fetched = ""
            if fetched.strip():
                req.code = fetched

        prompt = await self.prompt_loader.load(
            self.session, req.tenant_id, req.prompt_version
        )
        providers = await self._load_providers(req.tenant_id, req.provider)
        if not providers:
            raise ProviderError("no provider configured", status=502)

        primary = providers[0]
        cache_key = build_cache_key(
            model=primary.model,
            prompt_version=prompt.id,
            code=req.code,
            language=req.language,
        )

        analysis = AIAnalysis(
            id=gen_id("ana"),
            tenant_id=req.tenant_id,
            course_id=req.course_id,
            assignment_id=req.assignment_id,
            submission_id=req.submission_id,
            prompt_version=prompt.id,
            provider=primary.provider,
            model=primary.model,
            status="queued",
            trigger=req.trigger,
            cache_key=cache_key,
            cache_hit=False,
            currency="USD",
            parent_analysis_id=req.parent_analysis_id,
            created_by=req.actor_id,
        )
        self.session.add(analysis)
        await self.session.flush()

        await self.publisher.publish(
            build_event(
                "ai.analysis.queued.v1",
                tenant_id=req.tenant_id,
                subject=f"ai-analyses/{analysis.id}",
                data={
                    "analysis_id": analysis.id,
                    "submission_id": analysis.submission_id,
                    "prompt_version": prompt.id,
                    "provider": primary.provider,
                    "model": primary.model,
                },
            )
        )

        # ---------- Cache check ----------
        if not req.force_no_cache:
            cached = await self.cache.get(req.tenant_id, cache_key)
            if cached is not None:
                ai_cache_hits_total.inc()
                await self._finalize_cache_hit(analysis, cached, req)
                return analysis

        # ---------- Budget pre-check ----------
        budget = BudgetService(self.session)
        estimated_tokens = self.settings.MAX_PROMPT_TOKENS
        estimated_cost = Decimal("0")
        for scope, scope_id in self._budget_scopes(req):
            check = await budget.precheck(
                scope=scope,
                scope_id=scope_id,
                estimated_tokens=estimated_tokens,
                estimated_cost=estimated_cost,
            )
            if not check.allowed:
                analysis.status = "failed"
                analysis.failure_reason = "BUDGET_EXCEEDED"
                analysis.finished_at = datetime.now(UTC)
                ai_analyses_total.labels(
                    provider=primary.provider, status="failed", cache_hit="false"
                ).inc()
                if check.config and check.usage:
                    await self.publisher.publish(
                        make_exceeded_event(
                            tenant_id=req.tenant_id,
                            scope=scope,
                            scope_id=scope_id,
                            usage=check.usage,
                            config=check.config,
                        )
                    )
                from ..common.problem import budget_exceeded

                raise budget_exceeded(
                    f"Budget for {scope}={scope_id} exceeded for period {check.config.period if check.config else ''}"
                )

        # ---------- Provider call w/ failover ----------
        analysis.status = "running"
        analysis.started_at = datetime.now(UTC)
        await self.publisher.publish(
            build_event(
                "ai.analysis.started.v1",
                tenant_id=req.tenant_id,
                subject=f"ai-analyses/{analysis.id}",
                data={"analysis_id": analysis.id},
            )
        )

        wrapped = self._render_user_message(prompt, req)
        result, used_provider = await self._call_with_failover(
            providers, prompt, wrapped, analysis
        )

        if result is None:
            analysis.status = "failed"
            analysis.finished_at = datetime.now(UTC)
            ai_analyses_total.labels(
                provider=analysis.provider, status="failed", cache_hit="false"
            ).inc()
            await self.publisher.publish(
                build_event(
                    "ai.analysis.failed.v1",
                    tenant_id=req.tenant_id,
                    subject=f"ai-analyses/{analysis.id}",
                    data={
                        "analysis_id": analysis.id,
                        "reason": analysis.failure_reason or "all providers failed",
                    },
                )
            )
            return analysis

        analysis.provider = used_provider.provider
        analysis.model = used_provider.model
        await self._finalize_success(analysis, result, req, cache_key, used_provider, prompt)
        return analysis

    # --------------------------- Helpers -----------------------------------

    async def _load_providers(
        self, tenant_id: str, preferred: str | None
    ) -> list[ProviderConfig]:
        stmt = (
            select(ProviderConfig)
            .where(
                ProviderConfig.tenant_id == tenant_id,
                ProviderConfig.enabled.is_(True),
                ProviderConfig.deleted_at.is_(None),
            )
            # Tenant-default first, then by priority. Without this ordering
            # an auto-bootstrapped provider with priority=1 can shadow an
            # admin-configured default that happens to have a higher number.
            .order_by(
                ProviderConfig.default_for_tenant.desc(),
                ProviderConfig.priority.asc(),
            )
        )
        rows = list((await self.session.execute(stmt)).scalars())
        if preferred:
            rows.sort(key=lambda c: 0 if c.provider == preferred else 1)
        if not rows:
            # bootstrap fallback from settings (works for first-run with no admin)
            return [self._bootstrap_default(tenant_id)]
        return rows

    def _bootstrap_default(self, tenant_id: str) -> ProviderConfig:
        """Used when no admin-managed ProviderConfig exists yet.

        Defaults to **OpenRouter** (per F1: OpenAI-compatible API with the
        widest model coverage). The actual API key is read at request time
        from ``OPENROUTER_API_KEY`` env via ``api_key_env_var``.
        """
        s = self.settings
        provider_name = s.default_provider_resolved
        base_url = s.default_base_url_resolved
        env_var = "OPENROUTER_API_KEY" if "openrouter.ai" in base_url.lower() else "OPENAI_API_KEY"
        return ProviderConfig(
            id=gen_id("pcf"),
            tenant_id=tenant_id,
            provider=provider_name,
            base_url=base_url,
            model=s.default_model_resolved,
            api_key_secret_ref=None,
            api_key_env_var=env_var,
            enabled=True,
            default_for_tenant=True,
            priority=1,
            rate_limit_rpm=60,
            max_tokens=s.MAX_PROMPT_TOKENS + s.MAX_COMPLETION_TOKENS,
            supports_json_schema=True,
            settings={
                "pricing": {
                    "prompt_per_1k": 0.00015,
                    "completion_per_1k": 0.00060,
                    "currency": "USD",
                },
            },
        )

    def _render_user_message(self, prompt: PromptBundle, req: AnalysisRequest) -> str:
        # If the template already wraps `<student_code>...</student_code>` around
        # `{code}`, pass the raw student code so the wrapper appears exactly once.
        # Older templates (without the wrapper) get pre-wrapped here as before —
        # keeping prompt-injection defense in place regardless of which template
        # variant is active.
        template = prompt.user_template or ""
        if "<student_code>" in template and "</student_code>" in template:
            code_for_template: str = req.code
        else:
            code_for_template = wrap_student_code(req.code)
        # ``str.format`` ignores kwargs a template doesn't reference, so
        # passing ``assignment_description`` is safe even for older
        # templates that don't have the placeholder yet.
        return template.format(
            course_name=req.course_name or "",
            assignment_title=req.assignment_title or "",
            assignment_description=req.assignment_description or "",
            language=req.language or "plain",
            code=code_for_template,
        )

    async def _call_with_failover(
        self,
        providers: list[ProviderConfig],
        prompt: PromptBundle,
        user_message: str,
        analysis: AIAnalysis,
    ) -> tuple[AnalysisResult | None, ProviderConfig]:
        consecutive = 0
        last_provider = providers[0]
        for idx, cfg in enumerate(providers):
            if idx > 0:
                ai_provider_failovers_total.labels(
                    **{"from": last_provider.provider, "to": cfg.provider}
                ).inc()
            last_provider = cfg
            api_key = self._resolve_api_key(cfg)
            client = self.provider_factory.build(cfg, api_key)
            try:
                result = await client.analyze(
                    system_prompt=prompt.system_prompt,
                    user_message=user_message,
                    json_schema=prompt.json_schema,
                    prompt_version=prompt.id,
                )
                return result, cfg
            except ProviderError as exc:
                logger.warning(
                    "provider %s failed status=%s err=%s",
                    cfg.provider,
                    exc.status,
                    exc,
                )
                cfg.error_count = (cfg.error_count or 0) + 1
                analysis.failure_reason = f"{cfg.provider}: {exc}"
                if exc.status in {0, 401, 403, 404} and idx == 0:
                    # auth/not-found errors don't help to failover repeatedly;
                    # but spec says 429/5xx ≥ N consecutive triggers failover.
                    consecutive += 1
                else:
                    consecutive += 1
                if consecutive < self._failover_threshold and idx < len(providers) - 1:
                    continue
                # otherwise fall through to next provider
            except Exception as exc:  # noqa: BLE001
                logger.exception("provider %s raised", cfg.provider)
                analysis.failure_reason = f"{cfg.provider}: {exc}"
                continue
        return None, last_provider

    async def _finalize_cache_hit(
        self, analysis: AIAnalysis, cached: AnalysisResult, req: AnalysisRequest
    ) -> None:
        analysis.status = "completed"
        analysis.cache_hit = True
        analysis.report = cached.report.model_dump()
        analysis.raw_llm_response = cached.raw_text
        analysis.prompt_tokens = cached.tokens_used.prompt_tokens
        analysis.completion_tokens = cached.tokens_used.completion_tokens
        analysis.total_tokens = cached.tokens_used.total_tokens
        analysis.cost_estimate = Decimal("0")
        analysis.currency = cached.currency
        analysis.latency_ms = 0
        analysis.finished_at = datetime.now(UTC)
        analysis.injection_suspected = is_injection_suspected(cached.report, cached.raw_text)
        ai_analyses_total.labels(
            provider=analysis.provider, status="completed", cache_hit="true"
        ).inc()
        await self.publisher.publish(
            build_event(
                "ai.analysis.cache_hit.v1",
                tenant_id=req.tenant_id,
                subject=f"ai-analyses/{analysis.id}",
                data={"analysis_id": analysis.id, "cache_key": analysis.cache_key},
            )
        )
        await self.publisher.publish(
            build_event(
                "ai.analysis.completed.v1",
                tenant_id=req.tenant_id,
                subject=f"ai-analyses/{analysis.id}",
                data={
                    "analysis_id": analysis.id,
                    "submission_id": analysis.submission_id,
                    "cache_hit": True,
                    "max_risk_severity": _max_severity(cached.report),
                    "tokens": {
                        "prompt": analysis.prompt_tokens,
                        "completion": analysis.completion_tokens,
                        "total": analysis.total_tokens,
                    },
                },
            )
        )
        # Cache hit still counts toward usage (cache_hits++) but not tokens/cost.
        budget = BudgetService(self.session)
        for scope, scope_id in self._budget_scopes(req):
            await budget.commit_usage(
                scope=scope,
                scope_id=scope_id,
                prompt_tokens=0,
                completion_tokens=0,
                cost=Decimal("0"),
                cache_hit=True,
            )

    async def _finalize_success(
        self,
        analysis: AIAnalysis,
        result: AnalysisResult,
        req: AnalysisRequest,
        cache_key: str,
        used_provider: ProviderConfig,
        prompt: PromptBundle,
    ) -> None:
        analysis.status = "completed"
        analysis.report = result.report.model_dump()
        analysis.raw_llm_response = result.raw_text
        analysis.prompt_tokens = result.tokens_used.prompt_tokens
        analysis.completion_tokens = result.tokens_used.completion_tokens
        analysis.total_tokens = result.tokens_used.total_tokens
        # Re-estimate cost from provider pricing.
        pricing = (used_provider.settings or {}).get("pricing") if used_provider.settings else None
        cost, currency = estimate_cost(
            pricing, result.tokens_used.prompt_tokens, result.tokens_used.completion_tokens
        )
        analysis.cost_estimate = cost
        analysis.currency = currency
        analysis.latency_ms = result.latency_ms
        analysis.finished_at = datetime.now(UTC)
        analysis.cache_hit = False
        analysis.injection_suspected = is_injection_suspected(
            result.report, result.raw_text
        )
        if analysis.injection_suspected:
            ai_prompt_injection_detected_total.inc()

        used_provider.last_success_at = datetime.now(UTC)
        used_provider.error_count = 0

        ai_analyses_total.labels(
            provider=used_provider.provider, status="completed", cache_hit="false"
        ).inc()
        ai_analyses_duration_seconds.labels(provider=used_provider.provider).observe(
            max(result.latency_ms, 0) / 1000.0
        )
        ai_tokens_used_total.labels(provider=used_provider.provider, type="prompt").inc(
            result.tokens_used.prompt_tokens
        )
        ai_tokens_used_total.labels(
            provider=used_provider.provider, type="completion"
        ).inc(result.tokens_used.completion_tokens)
        ai_cost_total.labels(provider=used_provider.provider, currency=currency).inc(
            float(cost)
        )

        # cache the result for subsequent identical requests
        await self.cache.set(req.tenant_id, cache_key, result)

        # commit budget usage and emit warning if needed
        budget = BudgetService(self.session)
        for scope, scope_id in self._budget_scopes(req):
            usage = await budget.commit_usage(
                scope=scope,
                scope_id=scope_id,
                prompt_tokens=result.tokens_used.prompt_tokens,
                completion_tokens=result.tokens_used.completion_tokens,
                cost=cost,
                cache_hit=False,
            )
            if usage is None:
                continue
            config = await budget.get_config(scope, scope_id)
            if config is None:
                continue
            ratio_tokens = (
                Decimal(usage.total_tokens) / Decimal(config.max_tokens)
                if config.max_tokens
                else Decimal("0")
            )
            ratio_cost = (
                Decimal(usage.total_cost) / Decimal(config.max_cost)
                if config.max_cost
                else Decimal("0")
            )
            ratio = max(ratio_tokens, ratio_cost)
            if ratio >= Decimal(config.soft_warn_at) and warning_should_fire(usage):
                usage.last_warned_at = datetime.now(UTC)
                await self.publisher.publish(
                    make_warning_event(
                        tenant_id=req.tenant_id,
                        scope=scope,
                        scope_id=scope_id,
                        usage=usage,
                        config=config,
                    )
                )
            if ratio >= Decimal(config.hard_stop_at):
                await self.publisher.publish(
                    make_exceeded_event(
                        tenant_id=req.tenant_id,
                        scope=scope,
                        scope_id=scope_id,
                        usage=usage,
                        config=config,
                    )
                )

        await self.publisher.publish(
            build_event(
                "ai.analysis.completed.v1",
                tenant_id=req.tenant_id,
                subject=f"ai-analyses/{analysis.id}",
                data={
                    "analysis_id": analysis.id,
                    "submission_id": analysis.submission_id,
                    "cache_hit": False,
                    "provider": used_provider.provider,
                    "model": used_provider.model,
                    "max_risk_severity": _max_severity(result.report),
                    "tokens": {
                        "prompt": result.tokens_used.prompt_tokens,
                        "completion": result.tokens_used.completion_tokens,
                        "total": result.tokens_used.total_tokens,
                    },
                    "cost_estimate": str(cost),
                    "currency": currency,
                    "injection_suspected": analysis.injection_suspected,
                },
            )
        )

    def _resolve_api_key(self, cfg: ProviderConfig) -> str | None:
        """Resolve the API key for a ProviderConfig row.

        Order:
          1. ``api_key_env_var`` — read os.environ[name] (or settings field) at
             request time. **Preferred** for OpenRouter / OpenAI / etc.
          2. ``api_key_secret_ref`` — Vault path (resolved here later; treated as
             the literal secret value for now).
          3. Global ``Settings.resolve_api_key()`` fallback (legacy).
        """
        if getattr(cfg, "api_key_env_var", None):
            value = self.settings.resolve_api_key(env_var=cfg.api_key_env_var)
            if value:
                return value
        if cfg.api_key_secret_ref:
            return cfg.api_key_secret_ref
        return self.settings.resolve_api_key()

    def _budget_scopes(self, req: AnalysisRequest) -> list[tuple[str, str]]:
        scopes = [("tenant", req.tenant_id)]
        if req.course_id:
            scopes.append(("course", req.course_id))
        return scopes


def _max_severity(report: PlagLensReport) -> str:
    order = {"low": 1, "medium": 2, "high": 3}
    if not report.risk_signals:
        return "none"
    return max(report.risk_signals, key=lambda s: order.get(s.severity, 0)).severity
