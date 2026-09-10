from pathlib import Path
import re
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def inline_markdown(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r"<font name='ArialMono'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^]]+)\]\(([^)]+)\)", r"<link href='\2' color='#176c5b'>\1</link>", text)
    text = re.sub(r"&lt;(https?://[^&]+)&gt;", r"<link href='\1' color='#176c5b'>\1</link>", text)
    return text


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d8dfdc"))
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Arial", 8)
    canvas.setFillColor(colors.HexColor("#60706b"))
    canvas.drawString(18 * mm, 9 * mm, "Grupo Poliplast - Manual practico del CRM")
    canvas.drawRightString(192 * mm, 9 * mm, f"Pagina {doc.page}")
    canvas.restoreState()


def build(source: Path, target: Path):
    fonts = Path("C:/Windows/Fonts")
    pdfmetrics.registerFont(TTFont("Arial", str(fonts / "arial.ttf")))
    pdfmetrics.registerFont(TTFont("ArialBold", str(fonts / "arialbd.ttf")))
    pdfmetrics.registerFont(TTFont("ArialMono", str(fonts / "consola.ttf")))

    styles = getSampleStyleSheet()
    body = ParagraphStyle("Body", fontName="Arial", fontSize=9.5, leading=14, textColor=colors.HexColor("#26342f"), spaceAfter=5)
    h1 = ParagraphStyle("H1", parent=body, fontName="ArialBold", fontSize=22, leading=26, textColor=colors.HexColor("#123f36"), spaceAfter=12)
    h2 = ParagraphStyle("H2", parent=body, fontName="ArialBold", fontSize=15, leading=19, textColor=colors.HexColor("#176c5b"), spaceBefore=10, spaceAfter=6)
    h3 = ParagraphStyle("H3", parent=body, fontName="ArialBold", fontSize=11.5, leading=15, textColor=colors.HexColor("#b45f18"), spaceBefore=7, spaceAfter=4)
    meta = ParagraphStyle("Meta", parent=body, fontSize=9, leading=13, textColor=colors.HexColor("#52635e"))
    small = ParagraphStyle("Small", parent=body, fontSize=8.2, leading=11)
    table_header = ParagraphStyle("TableHeader", parent=small, fontName="ArialBold", textColor=colors.white)
    cover = ParagraphStyle("Cover", parent=h1, alignment=TA_CENTER, fontSize=25, leading=30, spaceAfter=16)

    lines = source.read_text(encoding="utf-8").splitlines()
    story = [Spacer(1, 22 * mm)]
    i = 0
    first_heading = True
    while i < len(lines):
        raw = lines[i].rstrip()
        stripped = raw.strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("| ") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            table_lines = [stripped]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            data = []
            for row_index, row in enumerate(table_lines):
                cells = [c.strip() for c in row.strip("|").split("|")]
                cell_style = table_header if row_index == 0 else small
                data.append([Paragraph(inline_markdown(c), cell_style) for c in cells])
            widths = [174 * mm / len(data[0])] * len(data[0])
            table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#176c5b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "ArialBold"),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f5f8f7")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cad5d1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.extend([table, Spacer(1, 4 * mm)])
            continue
        if stripped.startswith("# "):
            if first_heading:
                story.append(Paragraph(inline_markdown(stripped[2:]), cover))
                first_heading = False
            else:
                story.append(Paragraph(inline_markdown(stripped[2:]), h1))
        elif stripped.startswith("## "):
            story.append(Paragraph(inline_markdown(stripped[3:]), h2))
        elif stripped.startswith("### "):
            story.append(Paragraph(inline_markdown(stripped[4:]), h3))
        elif re.match(r"^[-*] ", stripped):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*] ", lines[i]):
                item = re.sub(r"^\s*[-*] ", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline_markdown(item), body), leftIndent=10))
                i += 1
            story.append(ListFlowable(items, bulletType="bullet", leftIndent=16, bulletFontName="Arial", bulletFontSize=7))
            story.append(Spacer(1, 2 * mm))
            continue
        elif re.match(r"^\d+\. ", stripped):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\. ", lines[i]):
                item = re.sub(r"^\s*\d+\. ", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline_markdown(item), body), leftIndent=12))
                i += 1
            story.append(ListFlowable(items, bulletType="1", leftIndent=18, bulletFontName="Arial", bulletFontSize=8))
            story.append(Spacer(1, 2 * mm))
            continue
        elif stripped == "---":
            story.append(Spacer(1, 3 * mm))
        elif stripped.startswith("**") and ":**" in stripped:
            story.append(Paragraph(inline_markdown(stripped), meta))
        else:
            paragraph = stripped
            while i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                if not nxt or nxt.startswith(("#", "|", "- ", "* ")) or re.match(r"^\d+\. ", nxt):
                    break
                paragraph += " " + nxt
                i += 1
            story.append(Paragraph(inline_markdown(paragraph), body))
        i += 1

    target.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=18 * mm, bottomMargin=19 * mm, title="Manual practico de Poliplast Sales Copilot", author="Grupo Poliplast")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_crm_manual_pdf.py SOURCE.md TARGET.pdf")
    build(Path(sys.argv[1]), Path(sys.argv[2]))
