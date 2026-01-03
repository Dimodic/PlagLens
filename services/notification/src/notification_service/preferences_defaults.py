"""Defaults for NotificationPreference + per-event matrix."""
from __future__ import annotations

from typing import Any

DEFAULT_CHANNELS = {"inapp": True, "email": True, "telegram": False}

DEFAULT_PER_EVENT: dict[str, dict[str, bool]] = {
    "submission.submission.created.v1": {"inapp": True, "email": False, "telegram": False},
    "submission.grade.assigned.v1": {"inapp": True, "email": True, "telegram": True},
    "submission.grade.changed.v1": {"inapp": True, "email": True, "telegram": False},
    "submission.feedback.added.v1": {"inapp": True, "email": True, "telegram": False},
    "course.member.added.v1": {"inapp": True, "email": True, "telegram": False},
    "course.assignment.created.v1": {"inapp": True, "email": True, "telegram": False},
    "course.assignment.deadline_changed.v1": {"inapp": True, "email": True, "telegram": True},
    "integration.import.completed.v1": {"inapp": True, "email": True, "telegram": False},
    "integration.import.failed.v1": {"inapp": True, "email": True, "telegram": True},
    "plagiarism.run.completed.v1": {"inapp": True, "email": True, "telegram": False},
    "plagiarism.run.failed.v1": {"inapp": True, "email": True, "telegram": False},
    "plagiarism.suspicious_pair.flagged.v1": {"inapp": True, "email": False, "telegram": False},
    "ai.analysis.completed.v1": {"inapp": True, "email": False, "telegram": False},
    "ai.budget.warning.v1": {"inapp": True, "email": True, "telegram": False},
    "ai.budget.exceeded.v1": {"inapp": True, "email": True, "telegram": True},
    "reporting.export.completed.v1": {"inapp": True, "email": True, "telegram": False},
    "reporting.export.failed.v1": {"inapp": True, "email": True, "telegram": False},
    "operation.status_changed.v1": {"inapp": True, "email": False, "telegram": False},
    "identity.user.email_verified.v1": {"inapp": True, "email": False, "telegram": False},
    "identity.user.password_changed.v1": {"inapp": True, "email": True, "telegram": True},
}

EVENT_DESCRIPTIONS: dict[str, str] = {
    "submission.submission.created.v1": "Ваша посылка принята",
    "submission.grade.assigned.v1": "Получена оценка",
    "submission.grade.changed.v1": "Оценка изменена",
    "submission.feedback.added.v1": "Получен комментарий преподавателя",
    "course.member.added.v1": "Вас добавили в курс",
    "course.assignment.created.v1": "Создано новое задание",
    "course.assignment.deadline_changed.v1": "Изменён дедлайн задания",
    "integration.import.completed.v1": "Импорт завершён",
    "integration.import.failed.v1": "Импорт не удался",
    "plagiarism.run.completed.v1": "Проверка плагиата завершена",
    "plagiarism.run.failed.v1": "Проверка плагиата упала",
    "plagiarism.suspicious_pair.flagged.v1": "Найдена подозрительная пара",
    "ai.analysis.completed.v1": "LLM-анализ готов",
    "ai.budget.warning.v1": "Бюджет LLM приближается к лимиту",
    "ai.budget.exceeded.v1": "Бюджет LLM исчерпан",
    "reporting.export.completed.v1": "Экспорт готов",
    "reporting.export.failed.v1": "Экспорт не удался",
    "operation.status_changed.v1": "Изменение статуса операции",
    "identity.user.email_verified.v1": "Email подтверждён",
    "identity.user.password_changed.v1": "Пароль изменён",
}


def default_per_event() -> dict[str, dict[str, bool]]:
    return {k: dict(v) for k, v in DEFAULT_PER_EVENT.items()}


def default_preferences_payload(user_id: str, tenant_id: str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "channels_enabled": dict(DEFAULT_CHANNELS),
        "email_digest_frequency": "instant",
        "per_event": default_per_event(),
        "quiet_hours_start": None,
        "quiet_hours_end": None,
        "timezone": "UTC",
        "locale": "ru",
        "email": None,
        "telegram_chat_id": None,
        "email_disabled": False,
        "telegram_revoked": False,
    }
