"""Prometheus metrics specific to AI Analysis Service."""
from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

ai_analyses_total = Counter(
    "ai_analyses_total",
    "Number of AI analyses",
    labelnames=("provider", "status", "cache_hit"),
)
ai_analyses_duration_seconds = Histogram(
    "ai_analyses_duration_seconds",
    "Wall-clock duration of LLM analysis",
    labelnames=("provider",),
)
ai_tokens_used_total = Counter(
    "ai_tokens_used_total",
    "Tokens consumed",
    labelnames=("provider", "type"),
)
ai_cost_total = Counter(
    "ai_cost_total",
    "Cost accumulated",
    labelnames=("provider", "currency"),
)
ai_cache_hits_total = Counter("ai_cache_hits_total", "AI cache hits")
ai_cache_size_bytes = Gauge("ai_cache_size_bytes", "Approximate cache size in bytes")
ai_budget_warnings_total = Counter(
    "ai_budget_warnings_total", "Budget soft-cap warnings", labelnames=("scope",)
)
ai_budget_exceeded_total = Counter(
    "ai_budget_exceeded_total", "Budget hard-cap hits", labelnames=("scope",)
)
ai_provider_failovers_total = Counter(
    "ai_provider_failovers_total",
    "Provider failovers",
    labelnames=("from", "to"),
)
ai_prompt_injection_detected_total = Counter(
    "ai_prompt_injection_detected_total", "Sanity-check injection detections"
)
