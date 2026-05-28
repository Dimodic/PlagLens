"""Adapter ABC and shared dataclasses."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar, Dict, List, Optional


@dataclass
class ConnectionStatus:
    ok: bool
    detail: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RemoteCourse:
    external_id: str
    title: str
    description: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RemoteParticipant:
    """A user enrolled in a remote course / contest.

    Identity providers (Yandex / Stepik) rarely return an email — usually we
    have a ``login`` and an ``external_id``. The downstream ``identity``
    service uses ``external_id`` as the dedup key when creating users.

    ``participant_id`` is the contest-scoped numeric id Yandex.Contest puts
    on each submission row (``authorId``/``participantId``). It CHANGES
    between contests, so don't use it as a stable user key. The stable
    one is ``login`` (yandex passport login). We surface both so the
    submission-import path can map nonstable participantIds back to the
    stable login.
    """

    external_id: str
    role: str  # "student" | "teacher" | "assistant"
    login: Optional[str] = None
    name: Optional[str] = None
    surname: Optional[str] = None
    email: Optional[str] = None
    participant_id: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RemoteSubmission:
    """A single submission/run pulled from a remote contest.

    Carries enough to (a) dedupe (external_id), (b) attribute to a user
    (login + external_user_id), (c) place under the right assignment
    (problem_id / problem_alias), (d) ship as code into submission-service
    (source_code + language + filename), and (e) preserve the remote verdict.
    """

    external_id: str
    problem_id: Optional[str] = None
    problem_alias: Optional[str] = None
    external_user_id: Optional[str] = None
    login: Optional[str] = None
    language: Optional[str] = None
    source_code: Optional[str] = None
    filename: Optional[str] = None
    submitted_at: Optional[datetime] = None
    verdict: Optional[str] = None
    score: Optional[float] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RemoteProblem:
    """A single problem (a.k.a. task) inside a remote contest.

    The ``alias`` is the human-visible letter — "A", "B", ... — used by
    Y.C. as the URL-segment / display label. ``external_id`` is the
    internal problem id when the remote exposes one (sometimes equal to
    ``alias``). ``title`` is the friendly name shown to the student.
    ``statement_html`` / ``statement_text`` carry the problem text when the
    remote returns it (Y.C.'s endpoint serves rendered HTML); both are
    optional so adapters can omit one if not available.
    """

    external_id: str
    title: str
    alias: Optional[str] = None
    position: Optional[int] = None
    statement_html: Optional[str] = None
    statement_text: Optional[str] = None
    time_limit_ms: Optional[int] = None
    memory_limit_bytes: Optional[int] = None
    language_hint: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ImportResult:
    imported: int = 0
    skipped: int = 0
    failed: int = 0
    cursor: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    participants: List[RemoteParticipant] = field(default_factory=list)
    submissions: List[RemoteSubmission] = field(default_factory=list)
    problems: List[RemoteProblem] = field(default_factory=list)


@dataclass
class DomainEvent:
    type: str
    data: Dict[str, Any]
    tenant_id: Optional[str] = None


class IntegrationAdapter(ABC):
    """Pluggable adapter for an external system."""

    kind: ClassVar[str] = ""

    @abstractmethod
    async def test_connection(self, config: Any) -> ConnectionStatus: ...

    @abstractmethod
    async def list_remote_courses(self, config: Any) -> List[RemoteCourse]: ...

    @abstractmethod
    async def import_submissions(
        self,
        config: Any,
        scope: Dict[str, Any],
        since: Optional[datetime],
    ) -> ImportResult: ...

    async def import_participants(
        self,
        config: Any,
        scope: Dict[str, Any],
    ) -> ImportResult:
        """List people enrolled in the remote course / contest.

        Default returns an empty result so adapters that don't support people
        enumeration (e.g. ``manual`` CSV upload) don't have to override.
        """
        _ = (config, scope)
        return ImportResult()

    async def import_problems(
        self,
        config: Any,
        scope: Dict[str, Any],
    ) -> ImportResult:
        """Pull the list of problems (tasks) from a remote contest.

        Optional — adapters that have nothing problem-like (CSV upload,
        IDE plugins) should leave the default no-op. Result's
        ``.problems`` list carries the data.
        """
        _ = (config, scope)
        return ImportResult()

    async def handle_webhook(
        self,
        payload: bytes,
        headers: Dict[str, str],
        config: Optional[Any] = None,
    ) -> List[DomainEvent]:
        return []
