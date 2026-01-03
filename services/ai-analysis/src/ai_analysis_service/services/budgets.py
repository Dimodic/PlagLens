"""Budget pre-check and post-update logic with warning/exceeded events."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.events import build_event
from ..common.ids import gen_id
from ..common.metrics import (
    ai_budget_exceeded_total,
    ai_budget_warnings_total,
)
from ..config import get_settings
from ..models import BudgetConfig, BudgetUsage


@dataclass
class BudgetCheckResult:
    allowed: bool
    reason: str = ""
    warning: bool = False
    config: BudgetConfig | None = None
    usage: BudgetUsage | None = None


PERIODS = {"day": 1, "week": 7, "month": 30}


def _period_start(period: str, now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    if period == "day":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        start = now - timedelta(days=now.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def _ensure_usage(
    session: AsyncSession, config: BudgetConfig
) -> BudgetUsage:
    period_start = _period_start(config.period)
    stmt = select(BudgetUsage).where(
        BudgetUsage.scope == config.scope,
        BudgetUsage.scope_id == config.scope_id,
        BudgetUsage.period == config.period,
        BudgetUsage.period_start == period_start,
    )
    res = (await session.execute(stmt)).scalar_one_or_none()
    if res is not None:
        return res
    usage = BudgetUsage(
        id=gen_id("bus"),
        scope=config.scope,
        scope_id=config.scope_id,
        period=config.period,
        period_start=period_start,
    )
    session.add(usage)
    await session.flush()
    return usage


class BudgetService:
    """Pre-check + post-update for tenant + course budgets."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_config(
        self, scope: str, scope_id: str
    ) -> BudgetConfig | None:
        stmt = select(BudgetConfig).where(
            BudgetConfig.scope == scope, BudgetConfig.scope_id == scope_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def upsert_config(
        self,
        *,
        scope: str,
        scope_id: str,
        period: str = "month",
        max_tokens: int | None = None,
        max_cost: Decimal | None = None,
        soft_warn_at: Decimal | None = None,
    ) -> BudgetConfig:
        config = await self.get_config(scope, scope_id)
        if config is None:
            config = BudgetConfig(
                id=gen_id("bcf"),
                scope=scope,
                scope_id=scope_id,
                period=period,
                max_tokens=max_tokens,
                max_cost=max_cost,
                soft_warn_at=soft_warn_at or Decimal("0.8"),
                hard_stop_at=Decimal("1.0"),
            )
            self.session.add(config)
        else:
            config.period = period
            config.max_tokens = max_tokens
            config.max_cost = max_cost
            if soft_warn_at is not None:
                config.soft_warn_at = soft_warn_at
        await self.session.flush()
        return config

    async def usage_for(
        self, scope: str, scope_id: str
    ) -> tuple[BudgetConfig | None, BudgetUsage | None]:
        config = await self.get_config(scope, scope_id)
        if config is None:
            return None, None
        usage = await _ensure_usage(self.session, config)
        return config, usage

    async def precheck(
        self,
        *,
        scope: str,
        scope_id: str,
        estimated_tokens: int,
        estimated_cost: Decimal,
    ) -> BudgetCheckResult:
        config = await self.get_config(scope, scope_id)
        if config is None or (config.max_tokens is None and config.max_cost is None):
            return BudgetCheckResult(allowed=True)
        usage = await _ensure_usage(self.session, config)

        token_ratio = Decimal("0")
        cost_ratio = Decimal("0")
        if config.max_tokens:
            token_ratio = Decimal(usage.total_tokens + estimated_tokens) / Decimal(
                config.max_tokens
            )
        if config.max_cost:
            cost_ratio = (Decimal(usage.total_cost) + Decimal(estimated_cost)) / Decimal(
                config.max_cost
            )
        ratio = max(token_ratio, cost_ratio)

        if ratio >= Decimal(config.hard_stop_at):
            return BudgetCheckResult(
                allowed=False,
                reason="BUDGET_EXCEEDED",
                config=config,
                usage=usage,
            )
        warn = ratio >= Decimal(config.soft_warn_at)
        return BudgetCheckResult(allowed=True, warning=warn, config=config, usage=usage)

    async def commit_usage(
        self,
        *,
        scope: str,
        scope_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        cost: Decimal,
        cache_hit: bool,
    ) -> BudgetUsage | None:
        config = await self.get_config(scope, scope_id)
        if config is None:
            return None
        usage = await _ensure_usage(self.session, config)
        usage.prompt_tokens += int(prompt_tokens)
        usage.completion_tokens += int(completion_tokens)
        usage.total_tokens += int(prompt_tokens + completion_tokens)
        usage.total_cost = Decimal(usage.total_cost) + Decimal(cost)
        usage.analyses_count += 1
        if cache_hit:
            usage.cache_hits += 1
        usage.updated_at = datetime.now(UTC)
        return usage


def warning_should_fire(
    usage: BudgetUsage,
    cooldown_s: int | None = None,
) -> bool:
    if cooldown_s is None:
        cooldown_s = get_settings().BUDGET_WARN_COOLDOWN_S
    if usage.last_warned_at is None:
        return True
    elapsed = (datetime.now(UTC) - usage.last_warned_at).total_seconds()
    return elapsed >= cooldown_s


def make_warning_event(
    *, tenant_id: str, scope: str, scope_id: str, usage: BudgetUsage, config: BudgetConfig
) -> Any:
    ai_budget_warnings_total.labels(scope=scope).inc()
    return build_event(
        "ai.budget.warning.v1",
        tenant_id=tenant_id,
        subject=f"budgets/{scope}/{scope_id}",
        data={
            "scope": scope,
            "scope_id": scope_id,
            "period": config.period,
            "total_tokens": usage.total_tokens,
            "total_cost": str(usage.total_cost),
            "max_tokens": config.max_tokens,
            "max_cost": str(config.max_cost) if config.max_cost is not None else None,
        },
    )


def make_exceeded_event(
    *, tenant_id: str, scope: str, scope_id: str, usage: BudgetUsage, config: BudgetConfig
) -> Any:
    ai_budget_exceeded_total.labels(scope=scope).inc()
    return build_event(
        "ai.budget.exceeded.v1",
        tenant_id=tenant_id,
        subject=f"budgets/{scope}/{scope_id}",
        data={
            "scope": scope,
            "scope_id": scope_id,
            "period": config.period,
            "total_tokens": usage.total_tokens,
            "total_cost": str(usage.total_cost),
            "max_tokens": config.max_tokens,
            "max_cost": str(config.max_cost) if config.max_cost is not None else None,
        },
    )
