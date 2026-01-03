"""Jinja2 template rendering for notification bodies/subjects.

Looks up `NotificationTemplate` from DB by (event_type, locale, channel, active=True),
falls back to bundled defaults under `templates/`.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import jinja2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.models import NotificationTemplate

_TEMPLATES_DIR = Path(__file__).parent / "templates"

def _autoescape_for_template(name: str | None) -> bool:
    """Autoescape any HTML-ish template, including ``.html.j2`` bundles."""
    if not name:
        return False
    lower = name.lower()
    return lower.endswith((".html", ".htm", ".xml", ".html.j2", ".htm.j2", ".xml.j2"))


_FILE_ENV = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=_autoescape_for_template,  # noqa: S701  -- explicit callable
    enable_async=False,
)
_STR_ENV = jinja2.Environment(
    autoescape=jinja2.select_autoescape(["html", "xml"]),
    enable_async=False,
)


DEFAULT_SUBJECTS = {
    "submission.grade.assigned.v1": "Оценка по заданию",
    "plagiarism.run.completed.v1": "Проверка плагиата завершена",
    "ai.analysis.completed.v1": "LLM-анализ готов",
    "ai.budget.warning.v1": "Бюджет LLM достигает лимита",
    "ai.budget.exceeded.v1": "Бюджет LLM исчерпан",
    "course.member.added.v1": "Вас добавили в курс",
    "integration.import.completed.v1": "Импорт завершён",
    "integration.import.failed.v1": "Импорт не удался",
    "submission.feedback.added.v1": "Получен новый комментарий",
    "reporting.export.completed.v1": "Экспорт готов",
    "reporting.export.failed.v1": "Экспорт не удался",
    "test": "Тестовое уведомление",
}

DEFAULT_BODIES = {
    "submission.grade.assigned.v1": "Преподаватель выставил оценку по заданию.",
    "plagiarism.run.completed.v1": "Отчёт о проверке плагиата готов.",
    "ai.analysis.completed.v1": "LLM-анализ завершён, отчёт доступен.",
    "ai.budget.warning.v1": "Достигнуто 80% месячного лимита LLM.",
    "ai.budget.exceeded.v1": "Месячный лимит LLM исчерпан.",
    "course.member.added.v1": "Вы добавлены в курс.",
    "integration.import.completed.v1": "Импорт посылок завершён успешно.",
    "integration.import.failed.v1": "Импорт посылок завершился с ошибкой.",
    "submission.feedback.added.v1": "К вашей посылке оставлен комментарий.",
    "reporting.export.completed.v1": "Экспорт отчёта готов к загрузке.",
    "reporting.export.failed.v1": "Экспорт отчёта завершился с ошибкой.",
    "test": "Это тестовое уведомление.",
}


# Map ``event_type`` (or its trimmed ``.v1`` form) to the on-disk template
# directory under ``templates/``.  Keys without the ``.v1`` suffix are also
# accepted so callers can use either spelling.
_FILE_TEMPLATE_DIRS: dict[str, str] = {
    "submission.grade.assigned": "submission_grade_assigned",
    "submission.grade.assigned.v1": "submission_grade_assigned",
    "plagiarism.run.completed": "plagiarism_run_completed",
    "plagiarism.run.completed.v1": "plagiarism_run_completed",
    "ai.analysis.completed": "ai_analysis_completed",
    "ai.analysis.completed.v1": "ai_analysis_completed",
    "course.member.added": "course_member_added",
    "course.member.added.v1": "course_member_added",
    "auth.email.verify": "auth_email_verify",
    "auth.email.verify.v1": "auth_email_verify",
}


def _load_file_template(
    event_type: str, channel: str, locale: str
) -> tuple[str, str] | None:
    """Try to render a file-based Jinja template bundle.

    Returns ``(subject, body)`` or ``None`` if no template files exist for
    the given (event_type, channel, locale) tuple.

    File layout::

        templates/<event_dir>/<locale>.<channel>.subject.j2
        templates/<event_dir>/<locale>.<channel>.html.j2     (email only)
        templates/<event_dir>/<locale>.<channel>.txt.j2      (email plain)
        templates/<event_dir>/<locale>.<channel>.body.j2     (inapp)
    """
    sub_dir = _FILE_TEMPLATE_DIRS.get(event_type)
    if not sub_dir:
        return None
    base = _TEMPLATES_DIR / sub_dir
    if not base.exists():
        return None
    subject_file = base / f"{locale}.{channel}.subject.j2"
    if not subject_file.exists():
        return None
    if channel == "email":
        html_file = base / f"{locale}.{channel}.html.j2"
        body_file = html_file if html_file.exists() else base / f"{locale}.{channel}.txt.j2"
    else:
        body_file = base / f"{locale}.{channel}.body.j2"
    if not body_file.exists():
        return None
    return subject_file.name, body_file.name


def _render_file_template(
    event_type: str, channel: str, locale: str, data: dict[str, Any]
) -> tuple[str, str] | None:
    sub_dir = _FILE_TEMPLATE_DIRS.get(event_type)
    if not sub_dir:
        return None
    pair = _load_file_template(event_type, channel, locale)
    if not pair:
        return None
    subject_name, body_name = pair
    sub_tmpl = _FILE_ENV.get_template(f"{sub_dir}/{subject_name}")
    body_tmpl = _FILE_ENV.get_template(f"{sub_dir}/{body_name}")
    subject = sub_tmpl.render(**data).strip()
    body = body_tmpl.render(**data)
    return subject, body


async def get_db_template(
    session: AsyncSession,
    event_type: str,
    channel: str,
    locale: str,
) -> NotificationTemplate | None:
    stmt = (
        select(NotificationTemplate)
        .where(
            NotificationTemplate.event_type == event_type,
            NotificationTemplate.channel == channel,
            NotificationTemplate.locale == locale,
            NotificationTemplate.active.is_(True),
        )
        .order_by(NotificationTemplate.version.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    return res.scalars().first()


def render_string(tmpl: str, data: dict[str, Any]) -> str:
    if not tmpl:
        return ""
    return _STR_ENV.from_string(tmpl).render(**data)


async def render(
    session: AsyncSession,
    *,
    event_type: str,
    channel: str,
    locale: str,
    data: dict[str, Any],
) -> tuple[str, str]:
    """Return (subject, body) for given event/channel/locale.

    Lookup order:
      1. ``NotificationTemplate`` row in DB (admin-managed).
      2. File-based bundled Jinja template under ``templates/<event_dir>/``.
      3. Baked-in :data:`DEFAULT_SUBJECTS` / :data:`DEFAULT_BODIES`.
    """
    tmpl = await get_db_template(session, event_type, channel, locale)
    if tmpl is not None:
        subject = render_string(tmpl.subject_template, data)
        body = render_string(tmpl.body_template, data)
        return subject, body

    # File template fallback.
    file_pair = _render_file_template(event_type, channel, locale, data)
    if file_pair is not None:
        return file_pair
    # Try the other locale before giving up (best-effort).
    other = "en" if locale != "en" else "ru"
    file_pair = _render_file_template(event_type, channel, other, data)
    if file_pair is not None:
        return file_pair

    # Fallback to baked-in defaults
    subject = DEFAULT_SUBJECTS.get(event_type, "Уведомление PlagLens")
    body_tmpl = DEFAULT_BODIES.get(event_type, "У вас новое уведомление.")
    body = render_string(body_tmpl, data)
    return subject, body


def list_known_event_types() -> list[tuple[str, str]]:
    return [(k, v) for k, v in DEFAULT_SUBJECTS.items() if k != "test"]
