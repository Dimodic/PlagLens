#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate the PlagLens architecture reference PDF (Russian, defense brief).

A self-contained reportlab/Platypus document an LLM (or the author) can lean on
when answering a defense committee's questions. Source of truth is the
implemented code, not the original technical task.

Run:  python tools/scripts/gen_architecture_pdf.py
Out:  PlagLens-Architecture.pdf  (repo root)
"""
from __future__ import annotations

import html
import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    XPreformatted,
)

# --------------------------------------------------------------------------- #
# Fonts (Cyrillic-capable Windows TTFs)
# --------------------------------------------------------------------------- #
FONTS = "C:/Windows/Fonts"
pdfmetrics.registerFont(TTFont("Sans", f"{FONTS}/segoeui.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", f"{FONTS}/segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("Sans-It", f"{FONTS}/segoeuii.ttf"))
pdfmetrics.registerFont(TTFont("Mono", f"{FONTS}/consola.ttf"))
pdfmetrics.registerFont(TTFont("Mono-Bold", f"{FONTS}/consolab.ttf"))
pdfmetrics.registerFontFamily(
    "Sans", normal="Sans", bold="Sans-Bold", italic="Sans-It", boldItalic="Sans-Bold"
)

# Palette — calm, monochrome-ish with one indigo accent (matches the app).
INK = colors.HexColor("#16181d")
MUTED = colors.HexColor("#5b6470")
RULE = colors.HexColor("#d7dbe0")
BRAND = colors.HexColor("#4f46e5")
BRAND_DK = colors.HexColor("#3730a3")
CARD_BG = colors.HexColor("#f4f5f7")
CODE_BG = colors.HexColor("#1e2128")
CODE_FG = colors.HexColor("#e6e8ec")
NOTE_BG = colors.HexColor("#eef0fb")
TH_BG = colors.HexColor("#2b2f38")

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "PlagLens-Architecture.pdf")
OUT = os.path.abspath(OUT)

# --------------------------------------------------------------------------- #
# Styles
# --------------------------------------------------------------------------- #
ss = getSampleStyleSheet()


def _st(name, **kw):
    base = kw.pop("parent", ss["Normal"])
    return ParagraphStyle(name, parent=base, **kw)


S = {
    "cover_kicker": _st("ck", fontName="Mono", fontSize=10, textColor=BRAND,
                        alignment=TA_CENTER, spaceAfter=10, leading=14),
    "cover_title": _st("ct", fontName="Sans-Bold", fontSize=40, textColor=INK,
                       alignment=TA_CENTER, leading=44, spaceAfter=8),
    "cover_sub": _st("cs", fontName="Sans", fontSize=14, textColor=MUTED,
                     alignment=TA_CENTER, leading=20, spaceAfter=4),
    "cover_meta": _st("cm", fontName="Sans", fontSize=10.5, textColor=MUTED,
                      alignment=TA_CENTER, leading=17),
    "h1": _st("h1", fontName="Sans-Bold", fontSize=19, textColor=INK,
              leading=23, spaceBefore=8, spaceAfter=10),
    "h1num": _st("h1n", fontName="Mono", fontSize=12, textColor=BRAND, leading=23),
    "h2": _st("h2", fontName="Sans-Bold", fontSize=13.5, textColor=BRAND_DK,
              leading=18, spaceBefore=12, spaceAfter=5),
    "h3": _st("h3", fontName="Sans-Bold", fontSize=11, textColor=INK,
              leading=15, spaceBefore=8, spaceAfter=3),
    "body": _st("body", fontName="Sans", fontSize=10, textColor=INK,
                leading=15, alignment=TA_JUSTIFY, spaceAfter=6),
    "bullet": _st("bul", fontName="Sans", fontSize=10, textColor=INK, leading=14.5),
    "lead": _st("lead", fontName="Sans", fontSize=10.5, textColor=MUTED,
                leading=15.5, spaceAfter=8, alignment=TA_JUSTIFY),
    "small": _st("sm", fontName="Sans", fontSize=8.5, textColor=MUTED, leading=12),
    "th": _st("th", fontName="Sans-Bold", fontSize=8.8, textColor=colors.white, leading=11),
    "td": _st("td", fontName="Sans", fontSize=8.8, textColor=INK, leading=12),
    "td_mono": _st("tdm", fontName="Mono", fontSize=8.2, textColor=INK, leading=11.5),
    "code": _st("code", fontName="Mono", fontSize=8.3, textColor=CODE_FG, leading=12.5),
    "note_t": _st("nt", fontName="Sans-Bold", fontSize=9.5, textColor=BRAND_DK, leading=13),
    "note_b": _st("nb", fontName="Sans", fontSize=9.3, textColor=INK, leading=13.5,
                  alignment=TA_JUSTIFY),
    "qa_q": _st("qaq", fontName="Sans-Bold", fontSize=10, textColor=BRAND_DK, leading=14,
                spaceBefore=9, spaceAfter=2),
    "qa_a": _st("qaa", fontName="Sans", fontSize=9.6, textColor=INK, leading=14,
                alignment=TA_JUSTIFY, spaceAfter=2),
    "toc": _st("toc", fontName="Sans", fontSize=10.5, textColor=INK, leading=20),
    "toc_n": _st("tocn", fontName="Mono", fontSize=10, textColor=BRAND, leading=20),
}

USABLE_W = A4[0] - 4 * cm  # 2cm margins both sides


def fmt(s: str) -> str:
    """Escape XML, then apply **bold** and `mono` inline markup."""
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`(.+?)`", r'<font face="Mono" size="9">\1</font>', s)
    return s


# --------------------------------------------------------------------------- #
# Flowable builders
# --------------------------------------------------------------------------- #
story: list = []


def P(text, style="body"):
    story.append(Paragraph(fmt(text), S[style]))


def lead(text):
    story.append(Paragraph(fmt(text), S["lead"]))


def H1(num, text):
    tbl = Table(
        [[Paragraph(num, S["h1num"]), Paragraph(fmt(text), S["h1"])]],
        colWidths=[1.15 * cm, USABLE_W - 1.15 * cm],
    )
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, -1), 1.2, BRAND),
    ]))
    story.append(Spacer(1, 6))
    story.append(tbl)
    story.append(Spacer(1, 8))


def H2(text):
    story.append(Paragraph(fmt(text), S["h2"]))


def H3(text):
    story.append(Paragraph(fmt(text), S["h3"]))


def BL(items, style="bullet"):
    flow = [ListItem(Paragraph(fmt(it), S[style]), leftIndent=10, value="•",
                     bulletColor=BRAND) for it in items]
    story.append(ListFlowable(flow, bulletType="bullet", start="•",
                              leftIndent=12, bulletFontName="Sans",
                              bulletFontSize=9, spaceAfter=6))


def CODE(text, lang=""):
    body = XPreformatted(html.escape(text.strip("\n"), quote=False), S["code"])
    t = Table([[body]], colWidths=[USABLE_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    story.append(Spacer(1, 2))
    story.append(t)
    story.append(Spacer(1, 7))


def NOTE(title, text):
    inner = [Paragraph(fmt(title), S["note_t"]), Spacer(1, 3),
             Paragraph(fmt(text), S["note_b"])]
    t = Table([[inner]], colWidths=[USABLE_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NOTE_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LINEBEFORE", (0, 0), (0, -1), 3, BRAND),
    ]))
    story.append(KeepTogether(t))
    story.append(Spacer(1, 7))


def TBL(header, rows, widths=None, mono_cols=()):
    if widths is None:
        widths = [USABLE_W / len(header)] * len(header)
    data = [[Paragraph(fmt(h), S["th"]) for h in header]]
    for r in rows:
        cells = []
        for ci, c in enumerate(r):
            st = S["td_mono"] if ci in mono_cols else S["td"]
            cells.append(Paragraph(fmt(str(c)), st))
        data.append(cells)
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TH_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, TH_BG),
    ]
    for ri in range(1, len(data)):
        if ri % 2 == 0:
            style.append(("BACKGROUND", (0, ri), (-1, ri), CARD_BG))
    t.setStyle(TableStyle(style))
    story.append(Spacer(1, 2))
    story.append(t)
    story.append(Spacer(1, 9))


def QA(q, a):
    story.append(Paragraph("В: " + fmt(q), S["qa_q"]))
    story.append(Paragraph("О: " + fmt(a), S["qa_a"]))


def gap(h=4):
    story.append(Spacer(1, h))


# =========================================================================== #
# CONTENT
# =========================================================================== #

# ---- Cover ----
story.append(Spacer(1, 4.8 * cm))
story.append(Paragraph("● АРХИТЕКТУРНЫЙ СПРАВОЧНИК ДЛЯ ЗАЩИТЫ", S["cover_kicker"]))
story.append(Paragraph("PlagLens", S["cover_title"]))
story.append(Paragraph(
    "Платформа автоматической проверки студенческих работ:<br/>"
    "антиплагиат и LLM-анализ кода", S["cover_sub"]))
story.append(Spacer(1, 1.0 * cm))
_rule = Table([[""]], colWidths=[5 * cm])
_rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 1, BRAND)]))
story.append(_rule)
story.append(Spacer(1, 1.0 * cm))
story.append(Paragraph(
    "Учебный проект · ФКН НИУ ВШЭ, ОП «Прикладной анализ данных»<br/>"
    "Развёрнут в продакшене: <font color='#4f46e5'>https://plaglens.ru</font><br/>"
    "Документ описывает <b>реализованную систему</b> (источник истины — код)<br/>"
    "Версия от 5 июня 2026 г.", S["cover_meta"]))
story.append(Spacer(1, 1.4 * cm))

# Key-facts strip on the cover
kf = [
    ["7", "микросервисов\nFastAPI"],
    ["1", "SPA-фронтенд\nReact 19"],
    ["4", "OAuth-провайдера\n+ e-mail"],
    ["Kafka", "событийная\nшина"],
]
kf_cells = []
for big, small in kf:
    inner = [Paragraph(big, _st("kfb", fontName="Sans-Bold", fontSize=22,
                                textColor=BRAND_DK, alignment=TA_CENTER, leading=24)),
             Paragraph(small.replace("\n", "<br/>"),
                       _st("kfs", fontName="Sans", fontSize=8, textColor=MUTED,
                           alignment=TA_CENTER, leading=10))]
    kf_cells.append(inner)
kft = Table([kf_cells], colWidths=[USABLE_W / 4] * 4)
kft.setStyle(TableStyle([
    ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LINEAFTER", (0, 0), (-2, -1), 0.5, RULE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story.append(kft)
story.append(PageBreak())

# ---- Table of contents ----
story.append(Paragraph("Содержание", S["h1"]))
story.append(Spacer(1, 6))
toc = [
    ("1", "Что такое PlagLens"),
    ("2", "Архитектура в целом"),
    ("3", "Технологический стек"),
    ("4", "Сервисы по отдельности"),
    ("5", "Модель данных"),
    ("6", "Аутентификация, RBAC и мультитенантность"),
    ("7", "Антиплагиат: движок Dolos"),
    ("8", "LLM-анализ кода"),
    ("9", "Интеграции и импорт/экспорт"),
    ("10", "Событийная шина (Kafka)"),
    ("11", "Инфраструктура и развёртывание"),
    ("12", "Наблюдаемость и надёжность"),
    ("13", "Ключевые архитектурные решения и компромиссы"),
    ("14", "Ограничения и планы развития"),
    ("15", "Вероятные вопросы комиссии и ответы"),
]
for num, title in toc:
    row = Table([[Paragraph(num, S["toc_n"]), Paragraph(title, S["toc"])]],
                colWidths=[1.1 * cm, USABLE_W - 1.1 * cm])
    row.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 0), (-1, -1), 0),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                             ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(row)
story.append(PageBreak())

# ===== 1. Что такое PlagLens =====
H1("01", "Что такое PlagLens")
lead("PlagLens — многопользовательская (мультитенантная) платформа для проверки "
     "студенческих работ по программированию: она принимает решения студентов, "
     "ищет заимствования между ними и анализирует код большой языковой моделью "
     "(LLM), помогая преподавателю быстрее и обоснованнее выставлять оценки — "
     "в одном месте, без ручной склейки между десятком вкладок.")
H2("Какую проблему решает")
BL([
    "Преподаватели CS-курсов вручную проверяют десятки/сотни решений, ищут списывание глазами и пишут однотипные комментарии — это долго и субъективно.",
    "Работы приходят из разных источников: Stepik, Яндекс.Контест, eJudge, прямые загрузки. Их нужно собрать в одном месте.",
    "Нужна не «чёрная коробка с процентом», а **объяснимый** результат: какие пары решений похожи, на чём именно, и что про код «думает» LLM.",
])
H2("Что система делает (сценарий преподавателя)")
BL([
    "Заводит курс и задания; импортирует условия и посылки из Stepik / Я.Контеста / eJudge или принимает прямые загрузки (код, ZIP, PDF).",
    "Запускает антиплагиат: попарное сравнение всех решений задания и сравнение со всем корпусом прошлых лет; получает кластеры подозрительных пар с подсветкой совпадений.",
    "Запускает LLM-анализ: краткое резюме решения, сигналы риска, вопросы на понимание — преподаватель сам решает, что показать студенту.",
    "Выставляет оценки и выгружает их в привязанную таблицу Google Sheets; студент видит свою оценку и комментарии в личном кабинете.",
])
H2("Роли")
BL([
    "**Студент** — отправляет решения, видит свои посылки, оценки и обратную связь.",
    "**Ассистент** — проверяет распределённые на него посылки, не управляет курсом.",
    "**Преподаватель** — владелец курса: задания, проверки, оценки, интеграции, экспорт.",
    "**Администратор** — управляет тенантом (организацией), пользователями, провайдерами входа и интеграциями.",
])

# ===== 2. Архитектура =====
H1("02", "Архитектура в целом")
lead("PlagLens построен как набор из 7 независимых сервисов на FastAPI поверх "
     "общей доменной модели, с событийной шиной Apache Kafka, единым Postgres "
     "(схема-на-сервис), Redis для кеша и лимитов и MinIO для файлов. Весь стек "
     "поднимается одной командой `docker compose up`.")
H2("Стиль архитектуры")
P("Микросервисы с **API-шлюзом** на входе и **событийной шиной** между сервисами. "
  "Синхронные операции (запросы пользователя) идут через шлюз по HTTP; "
  "асинхронные побочные эффекты (после загрузки посылки запустить антиплагиат, "
  "отправить уведомление, записать аудит) распространяются событиями через Kafka. "
  "Это даёт слабую связанность: сервис-источник не знает и не ждёт потребителей.")
H2("Поток запроса (сверху вниз)")
CODE(
"Браузер (React SPA)\n"
"      │  HTTPS\n"
"      ▼\n"
"  API Gateway  ── JWT-проверка (JWKS), грубый RBAC, rate-limit,\n"
"      │           idempotency, circuit breaker, маршрутизация\n"
"      ▼\n"
"  Доменные сервисы (HTTP):\n"
"  identity · course-submission · integration · plagiarism · ai-analysis · reporting\n"
"      │\n"
"      ├── publish/consume ──►  Apache Kafka  (CloudEvents-конверты)\n"
"      ▼\n"
"  Хранилища:  Postgres (схема-на-сервис) · Redis (кеш/лимиты) · MinIO (файлы)")
H2("Семь сервисов")
TBL(
    ["Сервис", "Зона ответственности"],
    [
        ["gateway", "Единая точка входа: аутентификация, маршрутизация, лимиты, идемпотентность, агрегированный health."],
        ["identity", "Пользователи, тенанты, RBAC, вход (e-mail + OAuth), 2FA, JWT-ключи, приглашения/коды."],
        ["course-submission", "Курсы, задания/ДЗ, посылки, версии, оценивание, распределение между ассистентами."],
        ["integration", "Адаптеры импорта (Stepik, Я.Контест, eJudge, ручная загрузка), Google Sheets, Telegram-бот, расписания/вебхуки."],
        ["plagiarism", "Оркестрация движка Dolos, попарные/кластерные результаты, кросс-курсовой корпус фингерпринтов, флаги подозрительности."],
        ["ai-analysis", "LLM-анализ кода через OpenAI-совместимый API: кеш, бюджеты, failover, защита от prompt-injection."],
        ["reporting", "Отчёты и экспорт оценок, дашборды-аналитика; вобрал в себя audit (журнал) и notification (e-mail/Telegram)."],
    ],
    widths=[3.7 * cm, USABLE_W - 3.7 * cm], mono_cols=(0,),
)
NOTE("Почему именно так",
     "Изначально доменов было больше (audit, notification и пара других — как "
     "отдельные сервисы). В ходе рефакторинга топология осознанно сведена к 7: "
     "`course` и `submission` слиты в `course-submission` (они всегда меняются "
     "вместе), а `audit` и `notification` стали внутренними модулями `reporting` "
     "(низкая нагрузка, общий жизненный цикл). Число сервисов — это компромисс "
     "между чёткими границами и эксплуатационной простотой, а не самоцель.")

# ===== 3. Стек =====
H1("03", "Технологический стек")
H2("Бэкенд (все сервисы)")
TBL(
    ["Слой", "Технология"],
    [
        ["Язык / рантайм", "Python 3.12, асинхронный (asyncio)"],
        ["Веб-фреймворк", "FastAPI 0.110+, Uvicorn"],
        ["Валидация / схемы", "Pydantic v2, pydantic-settings"],
        ["ORM / БД", "SQLAlchemy 2.x (async) + asyncpg, миграции Alembic"],
        ["Кеш / состояние", "Redis (redis-py async)"],
        ["События", "Apache Kafka через aiokafka, конверты в стиле CloudEvents"],
        ["Объектное хранилище", "MinIO (S3-совместимое) — файлы решений, аватары"],
        ["Аутентификация", "PyJWT[crypto] RS256, argon2-cffi (пароли), authlib (OAuth), pyotp (2FA)"],
        ["Наблюдаемость", "structlog (JSON-логи), prometheus-client, OpenTelemetry/Jaeger"],
        ["Общая библиотека", "plaglens-common: ошибки, RBAC, сервис-токены, ServiceClient, секреты"],
    ],
    widths=[4.2 * cm, USABLE_W - 4.2 * cm],
)
H2("Фронтенд (SPA)")
TBL(
    ["Слой", "Технология"],
    [
        ["Каркас", "React 19 + TypeScript 5.6, сборка Vite 5"],
        ["UI / стиль", "Tailwind CSS v4 + shadcn/ui (Radix UI primitives)"],
        ["Данные / запросы", "TanStack Query 5 (кеш, инвалидация), axios"],
        ["Маршрутизация", "react-router-dom 6"],
        ["Формы / валидация", "react-hook-form + zod"],
        ["Графики / таблицы", "Recharts (дашборды), Univer (редактор Google-таблиц)"],
        ["Прочее", "katex (формулы в условиях), i18n RU/EN, lucide / react-icons"],
        ["Тесты", "Vitest (юнит), Playwright (e2e)"],
    ],
    widths=[4.2 * cm, USABLE_W - 4.2 * cm],
)
H2("Инфраструктура")
TBL(
    ["Слой", "Технология"],
    [
        ["Оркестрация", "Docker Compose (один сетевой контур, именованные тома)"],
        ["Прокси / TLS", "Traefik (dev), nginx + Let's Encrypt (прод), Cloudflare DNS"],
        ["БД / кеш / файлы", "PostgreSQL, Redis, MinIO"],
        ["Шина", "Kafka в режиме KRaft (без ZooKeeper)"],
        ["Секреты", "HashiCorp Vault (KV v2) с env-first-приоритетом"],
        ["Метрики / трейсы", "Prometheus + Grafana, Jaeger"],
        ["CI/CD", "GitHub Actions: ruff + mypy + pytest на сервис, сборка образов в GHCR"],
    ],
    widths=[4.2 * cm, USABLE_W - 4.2 * cm],
)

# ===== 4. Сервисы =====
H1("04", "Сервисы по отдельности")

H2("Gateway — API-шлюз")
P("FastAPI-реверс-прокси, единственная публичная точка входа. Не содержит "
  "доменной логики — отвечает за сквозные задачи:")
BL([
    "Аутентификация по JWT (проверка подписи по JWKS от identity) + список отозванных токенов в Redis.",
    "Грубый RBAC по глобальной роли (тонкий — внутри каждого сервиса).",
    "Маршрутизация на бэкенд-сервисы по конфигу `gateway.yaml`.",
    "Rate-limit (token-bucket в Redis: по IP, по пользователю, по классу эндпоинта), CORS, лимит тела, request-id, трассировка.",
    "Кеш идемпотентности (повтор POST по `Idempotency-Key`), circuit breaker на каждый бэкенд.",
    "Универсальный диспетчер `/v1/operations/{id}` для отслеживания асинхронных операций и агрегированный `/v1/health`.",
])
H2("Identity — пользователи и доступ")
BL([
    "Вход: e-mail + пароль (argon2) и OAuth (Google, Яндекс ID, GitHub, Telegram — OIDC; Stepik OAuth для импорта).",
    "JWT RS256: access 15 мин, refresh 30 дней; ключи публикуются через JWKS, которым шлюз проверяет подпись.",
    "RBAC: ровно 4 глобальные роли; курс-роли (owner/co_owner/assistant/student) едут в JWT.",
    "Мультитенантность: организации (тенанты) изолированы; есть тенант-плейсхолдер `public` для самозарегистрировавшихся.",
    "Приглашения и короткие коды: преподаватель генерирует код, студент активирует его и попадает в курс (с переносом из public при необходимости).",
    "2FA по TOTP (pyotp), секрет шифруется Fernet; загрузка аватара в MinIO.",
])
H2("Course-Submission — курсы, задания, посылки")
BL([
    "Иерархия: курс → ДЗ (homework) → задание (assignment) → посылка (submission) с версиями.",
    "Приём решений: код, архивы, PDF; дедупликация по хешу содержимого; версии на одного автора.",
    "Оценивание: оценки, видимость для студента по флагу «release», распределение посылок между ассистентами (round-robin).",
    "Студенческие эндпоинты `/users/me/...` (свои посылки/оценки) и преподавательская очередь проверки.",
])
H2("Integration — импорт и внешние системы")
BL([
    "Адаптеры: Stepik, Яндекс.Контест, eJudge, ручная загрузка (ZIP/CSV); общий интерфейс `import_problems` / `import_submissions`.",
    "OAuth-потоки к внешним системам, токены в Redis; импорт «как ДЗ» с фоновой задачей и прогрессом (Redis-операция, опрос модалкой).",
    "Google Sheets: привязка таблицы к курсу, выгрузка оценок (Service Account или OAuth преподавателя).",
    "Telegram-бот для уведомлений; расписания (cron) и входящие вебхуки; DLQ для разбора ошибок.",
])
H2("Plagiarism — антиплагиат")
P("Оркестрирует движок **Dolos**, нормализует и хранит пары/кластеры, ведёт "
  "кросс-курсовой корпус фингерпринтов и жизненный цикл флага «подозрительно». "
  "Тяжёлые прогоны выполняются в очереди Celery. Подробно — раздел 7.")
H2("AI-Analysis — LLM-анализ")
P("Анализирует код через OpenAI-совместимый API. Содержит защиту от "
  "prompt-injection, кеш по хешу кода, бюджеты на тенант/курс, авто-failover "
  "между провайдерами и «курирование» LLM-ответа в обратную связь студенту. "
  "Подробно — раздел 8.")
H2("Reporting — отчёты, аудит, уведомления")
BL([
    "Экспорт оценок (Google Sheets, CSV) с «умным» сопоставлением ФИО/логина и подсветкой ячеек перед записью.",
    "Дашборды-аналитика: активность, живые метрики (из Prometheus), распределение оценок.",
    "Встроенный **audit** (журнал событий по ресурсам/тенанту) и **notification** (e-mail через SMTP/Mailgun/Resend и Telegram), слушающие события из Kafka.",
])

# ===== 5. Данные =====
H1("05", "Модель данных")
lead("Один кластер PostgreSQL, но у каждого сервиса — своя схема (namespace). "
     "Это даёт логическую изоляцию доменов (сервис ходит только в свою схему) "
     "при простоте эксплуатации одного кластера. У каждого сервиса своя роль БД "
     "с доступом только к своей схеме.")
H2("Схемы (по сервисам)")
TBL(
    ["Схема", "Ключевые сущности"],
    [
        ["identity", "users, tenants, oauth_identities, external_bindings, invitations, api_keys, totp"],
        ["course", "courses, homeworks, assignments, memberships, external_bindings"],
        ["submission", "submissions, submission_files, grades, feedback"],
        ["integration", "integration_configs, import_jobs, schedules, webhook_events, cursors"],
        ["plagiarism", "runs, pairs, clusters, corpus_fingerprints, suspicious_flags"],
        ["ai_analysis", "ai_analyses, budgets, providers, cache"],
        ["reporting / audit / notification", "exports, sheet_links, audit_events, email_transport_config, notifications"],
    ],
    widths=[4.6 * cm, USABLE_W - 4.6 * cm], mono_cols=(0,),
)
NOTE("Принцип «изоляция данных»",
     "Сервисы не лезут в чужие схемы напрямую — они общаются по HTTP (ServiceClient "
     "с сервис-JWT) или через события. Это сознательно: кросс-схемные SQL-запросы "
     "убирались в ходе рефакторинга в пользу HTTP, чтобы границы сервисов "
     "оставались настоящими, а не «общей базой под микросервисным соусом».")

# ===== 6. Auth / RBAC =====
H1("06", "Аутентификация, RBAC и мультитенантность")
H2("Токены")
BL([
    "Вход выдаёт пару **access (RS256 JWT, 15 мин) + refresh (30 дней)**. Refresh хранит список отзыва в Redis.",
    "Identity — единственный, кто подписывает токены (приватный RSA-ключ). Все остальные **проверяют** подпись публичным ключом, который раздаётся через `/.well-known/jwks.json`.",
    "Шлюз проверяет токен на входе и кладёт в заголовки идентичность; сервисы доверяют этому и доуточняют права у себя.",
])
H2("Четыре глобальные роли")
TBL(
    ["Роль", "Что может"],
    [
        ["admin", "Управление тенантом: пользователи, провайдеры входа, интеграции, аудит."],
        ["teacher", "Полный контроль над своими курсами: задания, проверки, оценки, экспорт."],
        ["assistant", "Проверка распределённых посылок; без управления курсом."],
        ["student", "Свои посылки, оценки и обратная связь."],
    ],
    widths=[2.6 * cm, USABLE_W - 2.6 * cm], mono_cols=(0,),
)
P("Помимо глобальной роли есть **курс-роли** (owner, co_owner, assistant, student) — "
  "права внутри конкретного курса. Они попадают в JWT, поэтому смена роли требует "
  "перелогина (флаг `requires_relogin`).")
H2("OAuth и вход")
BL([
    "Единый поток authorization-code + PKCE для всех провайдеров; стабильный callback `/{base}/api/v1/auth/oauth/{provider}/callback`.",
    "Telegram реализован как полноценный **OIDC** (client_id/secret, id_token), а не виджет — ради консистентности со всеми остальными провайдерами.",
    "Провайдер с пустыми кредами считается «настроен, но не инициализирован»: сервис стартует, лишь этот вход отвечает 400.",
])
H2("Мультитенантность")
P("Каждая организация — отдельный тенант; данные тенантов изолированы. "
  "Самозарегистрировавшийся пользователь попадает в тенант-плейсхолдер `public`; "
  "активация кода приглашения переносит его в тенант приглашающей организации. "
  "Сидовые тенанты: `public` и `system` (для платформенного админа).")

# ===== 7. Plagiarism =====
H1("07", "Антиплагиат: движок Dolos")
lead("PlagLens намеренно не пишет свой детектор плагиата, а оркестрирует "
     "проверенный open-source движок Dolos (популярный, активно развивается). "
     "Это соответствует принципу «готовые библиотеки вместо велосипедов».")
H2("Как Dolos находит заимствования")
BL([
    "**Парсинг через tree-sitter**: код разбирается в абстрактное синтаксическое дерево (AST), а не сравнивается как текст. Поэтому переименование переменных, переформатирование и комментарии не сбивают детектор.",
    "**Токенизация + фингерпринты (winnowing)**: из AST строится поток токенов, по нему — устойчивые хеш-отпечатки (k-граммы). Сравниваются именно отпечатки.",
    "**Попарное сходство**: для каждой пары решений считается доля общих фингерпринтов → процент сходства; строятся кластеры «подозрительно похожих».",
])
H2("Что добавляет PlagLens поверх движка")
BL([
    "Оркестрация прогонов (queued → running → completed/failed), хранение нормализованных пар/кластеров, soft-delete прогонов.",
    "**Кросс-курсовой корпус**: фингерпринты прошлых лет, чтобы ловить копии не только внутри группы, но и из старых потоков.",
    "Жизненный цикл флага «подозрительно» на посылке и подсветка совпадающих фрагментов в паре (объяснимость для преподавателя).",
    "Тяжёлые прогоны — в очереди **Celery** (брокер Redis), чтобы не блокировать API.",
])
NOTE("Формулировка для комиссии",
     "«Мы не изобретали алгоритм детекции: взяли Dolos — он строит AST через "
     "tree-sitter и сравнивает структурные фингерпринты, устойчивые к косметическим "
     "правкам. Наш вклад — оркестрация, кросс-курсовой корпус, объяснимая выдача "
     "(пары с подсветкой) и интеграция в проверку.»")

# ===== 8. LLM =====
H1("08", "LLM-анализ кода")
lead("ai-analysis обращается к LLM через OpenAI-совместимый API (по умолчанию "
     "OpenRouter / модель gpt-4o-mini). Один и тот же клиент работает с OpenAI, "
     "vLLM, llama.cpp, а через прокси — с YandexGPT/GigaChat.")
H2("Что важно для защиты")
BL([
    "**Защита от prompt-injection**: код студента оборачивается в теги `<student_code>`, в системном промпте есть явный запрет исполнять инструкции из кода, плюс пост-проверка ответа.",
    "**Кеш**: ключ `sha256(model + версия_промпта + хеш_кода + язык)`. Повтор не дёргает LLM, а отдаёт кеш и шлёт событие `ai.analysis.cache_hit` — экономит деньги.",
    "**Бюджеты**: счётчики токенов на тенант и курс в Postgres; до запроса pre-check (429 BUDGET_EXCEEDED), после — обновление. LLM не бесконечно дорогой.",
    "**Failover**: N подряд 429/5xx — переключение на следующего провайдера по приоритету.",
    "**Курирование**: LLM-ответ — это превью; преподаватель решает, что превратить в обратную связь студенту (HTTP-вызов в course-submission).",
])
H2("Что выдаёт LLM")
BL([
    "Краткое резюме решения (что делает код, какой подход).",
    "Сигналы риска (подозрительные места, потенциальные проблемы).",
    "Вопросы на понимание — чтобы преподаватель мог проверить авторство в беседе.",
])

# ===== 9. Integrations =====
H1("09", "Интеграции и импорт/экспорт")
H2("Импорт работ")
TBL(
    ["Источник", "Что и как импортируется"],
    [
        ["Stepik", "Дерево курса (уроки/шаги), импорт шагов «как ДЗ», подтягивание посылок по OAuth."],
        ["Яндекс.Контест", "Контесты, задачи, участники, посылки; пулинг по расписанию (вебхуков у Я.Контеста нет)."],
        ["eJudge", "Контест и задачи по токену."],
        ["Ручная загрузка", "ZIP / CSV / прямой файл (в т.ч. PDF) от студента или преподавателя."],
    ],
    widths=[3.3 * cm, USABLE_W - 3.3 * cm], mono_cols=(0,),
)
H2("Экспорт оценок в Google Sheets")
BL([
    "Привязка конкретной таблицы к курсу; запись через Service Account (на уровне тенанта) или OAuth-токен преподавателя.",
    "«Умное» сопоставление строк: ФИО → логин каскадом; структурный анализ листа (где какая задача), подсветка ячеек перед записью.",
    "История выгрузок и предпросмотр изменений — чтобы преподаватель видел, что именно запишется.",
])
H2("Надёжность импорта")
P("Импорт-как-ДЗ запускается фоновой задачей, прогресс пишется в Redis-операцию и "
  "опрашивается модалкой. Фоновые задачи держатся за сильную ссылку (`spawn_tracked`), "
  "чтобы сборщик мусора не оборвал длинный импорт; счётчик «получено посылок» "
  "тикает в реальном времени; состояние переживает перезагрузку страницы.")

# ===== 10. Kafka =====
H1("10", "Событийная шина (Kafka)")
lead("Асинхронные побочные эффекты распространяются событиями. Сервис-источник "
     "публикует факт («посылка создана») и ничего не знает о потребителях — те "
     "сами решают, что делать (запустить антиплагиат, уведомить, записать аудит).")
H2("Принципы")
BL([
    "Kafka в режиме **KRaft** (без ZooKeeper); конверты в стиле **CloudEvents** (type, source, subject, tenant_id).",
    "Версионирование типов событий: `...created.v1` — схему можно эволюционировать, не ломая потребителей.",
    "**Идемпотентность** потребителей и **DLQ** (dead-letter) на «ядовитые» сообщения, чтобы один сбойный месседж не вешал поток.",
])
H2("Примеры событий")
TBL(
    ["Событие", "Кто публикует → кто реагирует"],
    [
        ["submission.submission.created.v1", "course-submission → plagiarism (прогон), ai-analysis, reporting/notification"],
        ["integration.import.started/completed/failed.v1", "integration → reporting (история), фронт (прогресс)"],
        ["ai.analysis.completed / cache_hit.v1", "ai-analysis → reporting (метрики/история)"],
        ["identity user/role события", "identity → reporting/audit (журнал), notification"],
    ],
    widths=[6.4 * cm, USABLE_W - 6.4 * cm], mono_cols=(0,),
)

# ===== 11. Infra =====
H1("11", "Инфраструктура и развёртывание")
H2("Локально и в проде")
BL([
    "Весь стек — `docker compose up`: 7 сервисов + Postgres, Redis, Kafka, MinIO, Prometheus, Grafana, Jaeger, Vault, прокси.",
    "Каждый контейнер на старте ждёт готовности Postgres/Redis/Kafka, накатывает миграции Alembic, опционально бутстрапит админа (identity) и поднимает Uvicorn — без ручных шагов.",
    "Прод: `https://plaglens.ru`, настоящий сертификат Let's Encrypt, DNS через Cloudflare; секреты — только в server-side `.env` (в git не попадают).",
])
H2("Секреты")
P("Сервисы читают секреты через `plaglens_common.secrets` (Vault KV v2) с "
  "**env-first**-приоритетом: явная переменная окружения всегда побеждает, Vault "
  "спрашивается только если она не задана, а недоступный Vault или плейсхолдер "
  "`REPLACE_ME` мягко деградируют в `None` — контейнер всё равно стартует.")
H2("CI/CD")
P("GitHub Actions: на каждый сервис — `ruff check` + `ruff format --check` + "
  "`mypy` + `pytest` с покрытием; плюс валидация docker-compose, markdownlint и "
  "сборка libs. Тег `v*` собирает по образу на сервис в GHCR.")

# ===== 12. Observability =====
H1("12", "Наблюдаемость и надёжность")
TBL(
    ["Механизм", "Реализация"],
    [
        ["Логи", "structlog — структурированный JSON, request-id сквозной"],
        ["Метрики", "prometheus-client на каждом сервисе → Prometheus → дашборды Grafana (RPS, p95, ошибки, лаг Kafka)"],
        ["Трассировка", "OpenTelemetry → Jaeger (сквозной trace по сервисам)"],
        ["Health", "`/healthz`, `/readyz` на каждом; агрегированный `/v1/health` на шлюзе"],
        ["Защита от перегрузки", "rate-limit (token-bucket в Redis), circuit breaker на бэкенды"],
        ["Идемпотентность", "кеш по Idempotency-Key на шлюзе (защита от двойного POST)"],
        ["Устойчивость БД", "рискованные кросс-схемные чтения — в SAVEPOINT, чтобы сбой не ронял всю транзакцию"],
    ],
    widths=[4.4 * cm, USABLE_W - 4.4 * cm],
)

# ===== 13. Decisions =====
H1("13", "Ключевые архитектурные решения и компромиссы")
lead("Комиссия любит вопрос «почему так, а не иначе». Ниже — сознательные решения "
     "и их обоснование.")
H3("Микросервисы, а не монолит")
P("Чёткие границы доменов, независимый деплой и масштабирование тяжёлых частей "
  "(антиплагиат, LLM) отдельно от лёгких. Цена — сложнее эксплуатация; её гасим "
  "единым `docker compose`, общей библиотекой и схема-на-сервис в одном Postgres.")
H3("Один Postgres со схемами, а не БД-на-сервис")
P("Логическая изоляция (схема + роль на сервис) без операционной боли нескольких "
  "кластеров — разумный масштаб для учебной платформы. Путь к разделению открыт: "
  "схемы уже разнесены.")
H3("Готовый Dolos вместо своего детектора")
P("Детекция плагиата — сложная и хорошо решённая задача; писать свой алгоритм "
  "хуже проверенного. Наш вклад — оркестрация, корпус и объяснимость.")
H3("Событийная шина для побочных эффектов")
P("Загрузка посылки не должна ждать антиплагиат/LLM/уведомления. Источник "
  "публикует событие и отвечает мгновенно; потребители работают асинхронно.")
H3("Кросс-схемный SQL → HTTP")
P("Прямые запросы в чужую схему ломают границы сервисов; их заменили на HTTP-вызовы "
  "(ServiceClient + сервис-JWT). Где исторический кросс-схемный probe остался — он "
  "обёрнут в SAVEPOINT и мягко деградирует.")
H3("OIDC для всех провайдеров входа, включая Telegram")
P("Единый поток authorization-code + PKCE для Google/Яндекс/GitHub/Telegram — "
  "одинаковая модель (client_id/secret), меньше частных случаев в коде.")

# ===== 14. Limitations =====
H1("14", "Ограничения и планы развития")
H2("Что осознанно не доделано")
BL([
    "Vault и Kafka в проде — в dev-конфигурации (один брокер, dev-режим Vault); для боевой эксплуатации нужен кластер и sealed-Vault.",
    "Антиплагиат — один движок (Dolos); второй для кросс-проверки — в планах.",
    "Покрытие автотестами растёт, но неравномерно по сервисам.",
])
H2("Куда развивать (прикладное)")
BL([
    "**Антиплагиат для текстов** — рефераты и отчёты, а не только код.",
    "**Интерактивная защита решения** — LLM задаёт студенту вопросы по его коду.",
    "**Больше экспортов** — Moodle/LMS и открытый API помимо Google Sheets.",
    "**Зрелость прод-инфраструктуры** — секреты в Vault, сквозная трассировка, рост тестов.",
])

# ===== 15. Q&A =====
H1("15", "Вероятные вопросы комиссии и ответы")
lead("Краткие, по делу формулировки — опора для устного ответа.")

QA("Почему микросервисы для учебного проекта — не оверинжиниринг?",
   "Они дают чёткие доменные границы и возможность масштабировать тяжёлые части "
   "(антиплагиат, LLM) независимо. Эксплуатационную сложность гасим единым "
   "docker compose, общей библиотекой и одним Postgres со схемами. Топологию "
   "сознательно сократили с большего числа сервисов до 7, убрав избыточные.")
QA("Как именно работает поиск заимствований?",
   "Движок Dolos парсит код в AST через tree-sitter, строит структурные "
   "фингерпринты (winnowing) и сравнивает их попарно. Поэтому переименования и "
   "переформатирование не обманывают детектор. Мы оркестрируем прогоны, храним "
   "пары/кластеры, ведём кросс-курсовой корпус и подсвечиваем совпадения.")
QA("Что мешает студенту обмануть антиплагиат, поменяв имена переменных?",
   "Сравнение идёт по структуре (AST/фингерпринты), а не по тексту — косметика "
   "вроде переименований и форматирования сходство почти не снижает. Полная "
   "переработка алгоритма — да, но это уже другое решение, что и видно эксперту.")
QA("Не опасно ли отдавать код студентов в LLM? Промпт-инъекции?",
   "Код оборачивается в теги `<student_code>`, системный промпт запрещает "
   "исполнять инструкции из кода, есть пост-проверка ответа. Передаётся фрагмент "
   "в защищённой обёртке; политика конфиденциальности это описывает.")
QA("LLM — это же дорого. Как контролируете расход?",
   "Три механизма: кеш по хешу кода (повтор не дёргает модель), бюджеты-счётчики "
   "на тенант/курс с отказом 429 при превышении, и батч-анализ с предпросмотром "
   "оценки токенов перед запуском.")
QA("Что если LLM-провайдер недоступен?",
   "Авто-failover: после N подряд ошибок 429/5xx сервис переключается на "
   "следующего провайдера по приоритету. Клиент OpenAI-совместимый, так что "
   "провайдера можно сменить без изменения кода.")
QA("Как устроена авторизация и почему ей можно доверять между сервисами?",
   "Identity подписывает JWT (RS256) приватным ключом; остальные проверяют "
   "подпись публичным ключом из JWKS. Шлюз проверяет токен на входе, сервисы "
   "доуточняют права. Межсервисные вызовы — по короткоживущему сервис-JWT.")
QA("Как изолированы данные разных организаций (тенантов)?",
   "Каждая сущность привязана к tenant_id; запросы фильтруются по тенанту "
   "пользователя из токена. Плюс схема-на-сервис и роль БД с доступом только к "
   "своей схеме. Кросс-тенантные действия — отдельные, контролируемые сценарии.")
QA("Зачем Kafka, если можно вызвать сервис напрямую?",
   "Чтобы пользовательский запрос не ждал тяжёлых побочных эффектов и чтобы "
   "источник не зависел от потребителей. «Посылка создана» — одно событие, на "
   "которое независимо реагируют антиплагиат, LLM, уведомления и аудит.")
QA("Что произойдёт, если упадёт один сервис?",
   "Шлюз с circuit breaker вернёт понятную ошибку вместо зависания; асинхронные "
   "потребители Kafka переварят накопленные события после восстановления; "
   "«ядовитые» сообщения уходят в DLQ. Health-эндпоинты показывают состояние.")
QA("Чем подтверждается, что это рабочая система, а не прототип?",
   "Развёрнута в проде на plaglens.ru с настоящим TLS; реальные входы через "
   "Google/Яндекс/GitHub/Telegram; импорт из Stepik и Я.Контеста; выгрузка в "
   "Google Sheets; метрики в Grafana; CI с линтером, типами и тестами.")
QA("Почему взяли Dolos, а не написали свой движок или JPlag/MOSS?",
   "Принцип «проверенные библиотеки вместо велосипедов». Dolos — открытый, на "
   "tree-sitter, активно поддерживается и легко встраивается. Внешние сервисы "
   "(MOSS/Codequiry) убрали как лишнюю зависимость; ценность — в нашей обвязке.")
QA("Какой у проекта главный технический вызов был?",
   "Согласовать асинхронность: длинные импорты и прогоны не должны блокировать "
   "UI и не должны теряться. Решение — фоновые задачи с устойчивыми ссылками, "
   "прогресс в Redis, события в Kafka и идемпотентные потребители.")

story.append(Spacer(1, 10))
P("Этот документ описывает реализованную систему и предназначен как опора для "
  "ответов на защите. При расхождениях источником истины является код.", "small")


# --------------------------------------------------------------------------- #
# Page furniture (footer + page numbers)
# --------------------------------------------------------------------------- #
def footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:  # skip cover
        canvas.setFont("Sans", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(2 * cm, 1.15 * cm, "PlagLens · Архитектурный справочник")
        canvas.drawRightString(A4[0] - 2 * cm, 1.15 * cm, f"{doc.page}")
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(2 * cm, 1.5 * cm, A4[0] - 2 * cm, 1.5 * cm)
    canvas.restoreState()


doc = BaseDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
    title="PlagLens — Архитектура и справочник для защиты",
    author="PlagLens", subject="Архитектура платформы PlagLens",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])
doc.build(story)
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
