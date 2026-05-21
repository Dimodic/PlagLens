"""RBAC permissions matrix and role helpers (matches 02-RBAC.md)."""
from __future__ import annotations

from typing import Iterable, Literal

GlobalRole = Literal["admin", "teacher", "assistant", "student"]
CourseRole = Literal["owner", "co_owner", "assistant", "student"]

GLOBAL_ROLES: tuple[GlobalRole, ...] = ("admin", "teacher", "assistant", "student")
COURSE_ROLES: tuple[CourseRole, ...] = ("owner", "co_owner", "assistant", "student")


# --------------------------------------------------------------------------- #
# Permission catalogue
# --------------------------------------------------------------------------- #
# The full universe of permissions surfaced in the admin "Роли и разрешения"
# matrix (one checkbox per entry). Each value is the Russian description shown
# in the (i) tooltip. Authorization itself is enforced by role-name checks in
# the services; this catalogue + the editable matrix are the human-facing
# governance layer on top.
PERMISSION_CATALOGUE: dict[str, str] = {
    # Учреждения (tenants)
    "tenant.create": "Создавать учреждения",
    "tenant.list": "Просматривать список учреждений",
    "tenant.read": "Просматривать учреждение",
    "tenant.update": "Редактировать учреждение",
    "tenant.delete": "Удалять учреждения",
    "tenant.suspend": "Приостанавливать учреждения",
    "tenant.activate": "Активировать учреждения",
    "tenant.settings.read": "Просматривать настройки учреждения",
    "tenant.settings.update": "Изменять настройки учреждения",
    "tenant.usage.read": "Просматривать статистику учреждения",
    "tenant.audit.read": "Просматривать аудит учреждения",
    # Пользователи
    "user.list": "Просматривать список пользователей",
    "user.create": "Создавать пользователей",
    "user.read": "Просматривать профиль пользователя",
    "user.update": "Редактировать пользователей",
    "user.delete": "Удалять пользователей",
    "user.disable": "Блокировать пользователей",
    "user.enable": "Разблокировать пользователей",
    "user.anonymize": "Анонимизировать пользователей",
    "user.reset_password": "Сбрасывать пароли",
    "user.force_logout": "Завершать чужие сессии",
    "user.role.assign": "Назначать глобальные роли",
    "user.sessions.read": "Просматривать сессии пользователей",
    "user.audit.read": "Просматривать аудит пользователя",
    "user.batch_create": "Массово создавать пользователей",
    # Приглашения
    "invitation.create": "Создавать приглашения",
    "invitation.list": "Просматривать приглашения",
    "invitation.read": "Просматривать приглашение",
    "invitation.delete": "Удалять приглашения",
    # Кросс-тенант
    "cross_tenant.migrate_user": "Переносить пользователей между учреждениями",
    "cross_tenant.list_users": "Просматривать пользователей всех учреждений",
    # Курсы
    "course.create": "Создавать курсы",
    "course.read": "Просматривать курсы",
    "course.update": "Редактировать курсы",
    "course.delete": "Удалять курсы",
    "course.members.manage": "Управлять участниками курса",
    "course.archive": "Архивировать курсы",
    # Задания / ДЗ
    "assignment.create": "Создавать задания",
    "assignment.read": "Просматривать задания",
    "assignment.update": "Редактировать задания",
    "assignment.delete": "Удалять задания",
    "assignment.deadline.manage": "Управлять дедлайнами и продлениями",
    # Посылки и оценки
    "submission.read": "Просматривать посылки",
    "submission.create": "Загружать посылки",
    "submission.grade": "Выставлять оценки",
    "submission.distribute": "Распределять посылки на проверку",
    # Антиплагиат
    "plagiarism.run": "Запускать проверки на плагиат",
    "plagiarism.read": "Просматривать результаты антиплагиата",
    "plagiarism.corpus.manage": "Управлять корпусом сравнения",
    # LLM-анализ
    "ai.run": "Запускать LLM-анализ",
    "ai.read": "Просматривать результаты LLM-анализа",
    "ai.providers.manage": "Управлять каталогом LLM-провайдеров",
    "ai.budgets.manage": "Управлять бюджетами LLM",
    # Отчёты и экспорт
    "report.dashboard.read": "Просматривать дашборды",
    "report.export": "Создавать экспорты и ведомости",
    "report.schedule": "Настраивать регулярные экспорты",
    # Аудит
    "audit.read": "Просматривать журнал аудита",
    "audit.export": "Экспортировать аудит",
    "audit.retention.manage": "Управлять политикой хранения аудита",
    # Уведомления
    "notification.read": "Просматривать уведомления",
    "notification.templates.manage": "Управлять шаблонами уведомлений",
    "notification.config.manage": "Настраивать каналы уведомлений",
    # Интеграции
    "integration.read": "Просматривать интеграции",
    "integration.manage": "Управлять интеграциями (Я.Контест, Stepik, Telegram)",
}

_ALL_PERMISSIONS: set[str] = set(PERMISSION_CATALOGUE)

# Default grants per role (the seed shown until an admin customises the matrix).
# ``admin`` is the cross-tenant top role and holds everything.
PERMISSIONS_BY_GLOBAL_ROLE: dict[GlobalRole, set[str]] = {
    "admin": set(_ALL_PERMISSIONS),
    "teacher": {
        "user.list",
        "user.batch_create",
        "invitation.create",
        "invitation.list",
        "invitation.read",
        "invitation.delete",
        "course.create",
        "course.read",
        "course.update",
        "course.delete",
        "course.members.manage",
        "course.archive",
        "assignment.create",
        "assignment.read",
        "assignment.update",
        "assignment.delete",
        "assignment.deadline.manage",
        "submission.read",
        "submission.grade",
        "submission.distribute",
        "plagiarism.run",
        "plagiarism.read",
        "plagiarism.corpus.manage",
        "ai.run",
        "ai.read",
        "report.dashboard.read",
        "report.export",
        "report.schedule",
        "integration.read",
        "integration.manage",
    },
    # Teaching assistant: a course helper — can view and grade, but not create
    # or delete courses/assignments, and no institution administration.
    "assistant": {
        "user.list",
        "invitation.list",
        "invitation.read",
        "course.read",
        "assignment.read",
        "submission.read",
        "submission.grade",
        "plagiarism.read",
        "ai.read",
        "report.dashboard.read",
    },
    "student": {
        "submission.read",
        "submission.create",
    },
}


def role_has_permission(role: GlobalRole | str, permission: str) -> bool:
    return permission in PERMISSIONS_BY_GLOBAL_ROLE.get(role, set())  # type: ignore[arg-type]


def any_role_has(roles: Iterable[GlobalRole | str], permission: str) -> bool:
    return any(role_has_permission(r, permission) for r in roles)


def is_admin_or_above(role: GlobalRole | str) -> bool:
    return role == "admin"


def list_role_permissions(role: GlobalRole | str) -> list[str]:
    return sorted(PERMISSIONS_BY_GLOBAL_ROLE.get(role, set()))  # type: ignore[arg-type]


def describe_permission(permission: str) -> str | None:
    return PERMISSION_CATALOGUE.get(permission)


def list_all_permissions() -> list[tuple[str, str]]:
    """Catalogue as ordered (permission, description) pairs."""
    return list(PERMISSION_CATALOGUE.items())
