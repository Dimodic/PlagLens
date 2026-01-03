"""PDF encoder. Tries WeasyPrint first, falls back to reportlab table."""
from __future__ import annotations

import io
from html import escape

from ..builders.base import BuilderResult


def _render_html(result: BuilderResult) -> str:
    head = "".join(f"<th>{escape(c)}</th>" for c in result.columns)
    rows_html: list[str] = []
    for row in result.rows:
        cells = "".join(f"<td>{escape(str(row.get(c, '')))}</td>" for c in result.columns)
        rows_html.append(f"<tr>{cells}</tr>")
    return (
        "<html><head><meta charset='utf-8'><style>"
        "body{font-family:Arial,sans-serif;font-size:12px;}"
        "h1{font-size:16px;}"
        "table{border-collapse:collapse;width:100%;}"
        "th,td{border:1px solid #888;padding:4px 6px;text-align:left;}"
        "th{background:#eee;}"
        "</style></head><body>"
        f"<h1>{escape(result.title)}</h1>"
        f"<table><thead><tr>{head}</tr></thead>"
        f"<tbody>{''.join(rows_html)}</tbody></table>"
        "</body></html>"
    )


def to_pdf(result: BuilderResult) -> tuple[bytes, str]:
    html = _render_html(result)
    # Try WeasyPrint
    try:  # pragma: no cover - depends on system libs
        from weasyprint import HTML  # type: ignore

        return HTML(string=html).write_pdf(), "application/pdf"
    except Exception:
        pass
    # Fallback: reportlab table
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=result.title)
    styles = getSampleStyleSheet()
    elements = [Paragraph(result.title, styles["Heading1"]), Spacer(1, 12)]
    data: list[list[str]] = [list(result.columns)]
    for row in result.rows:
        data.append([str(row.get(c, "")) for c in result.columns])
    if len(data) == 1:
        data.append(["(no data)"] + [""] * (len(result.columns) - 1))
    t = Table(data, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
            ]
        )
    )
    elements.append(t)
    doc.build(elements)
    return buf.getvalue(), "application/pdf"
