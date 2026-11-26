"""Build the offline PDF from catalog.json using Python 3 and ReportLab.

Validation uses pypdf when installed, or the system pdfinfo/pdftotext tools.
DejaVu Sans is embedded when available; the built-in PDF font is the fallback.
The PDF contains a reader outline and searchable text. PDF bytes can differ
between builds because ReportLab writes creation metadata.
"""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import inch
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog.json"
OUTPUT = ROOT / "docs" / "downloads" / "integration-atlas-guide.pdf"
PAGE = (4 * inch, 7 * inch)


def register_fonts() -> tuple[str, str]:
    regular = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    bold = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    if regular.is_file() and bold.is_file():
        pdfmetrics.registerFont(TTFont("AtlasSans", str(regular)))
        pdfmetrics.registerFont(TTFont("AtlasSans-Bold", str(bold)))
        return "AtlasSans", "AtlasSans-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, BOLD = register_fonts()
BASE = getSampleStyleSheet()
STYLES = {
    "cover_title": ParagraphStyle(
        "CoverTitle", parent=BASE["Title"], fontName=BOLD, fontSize=20,
        leading=24, textColor=colors.HexColor("#18392d"), alignment=TA_LEFT,
        spaceAfter=9,
    ),
    "cover_sub": ParagraphStyle(
        "CoverSub", parent=BASE["BodyText"], fontName=FONT, fontSize=9,
        leading=13, textColor=colors.HexColor("#35453d"), spaceAfter=7,
    ),
    "section": ParagraphStyle(
        "Section", parent=BASE["Heading1"], fontName=BOLD, fontSize=13,
        leading=16, textColor=colors.HexColor("#18392d"), spaceAfter=6,
    ),
    "entry": ParagraphStyle(
        "IntegrationTitle", parent=BASE["Heading2"], fontName=BOLD, fontSize=13,
        leading=16, textColor=colors.HexColor("#18392d"), spaceAfter=2,
        keepWithNext=True,
    ),
    "domain": ParagraphStyle(
        "Domain", parent=BASE["BodyText"], fontName=FONT, fontSize=7.3,
        leading=9.2, textColor=colors.HexColor("#64716a"), spaceAfter=7,
        keepWithNext=True,
    ),
    "body": ParagraphStyle(
        "GuideBody", parent=BASE["BodyText"], fontName=FONT, fontSize=8.1,
        leading=11.2, textColor=colors.HexColor("#25332c"), spaceAfter=5,
    ),
    "label": ParagraphStyle(
        "GuideLabel", parent=BASE["BodyText"], fontName=BOLD, fontSize=8.1,
        leading=11.2, textColor=colors.HexColor("#18392d"), spaceAfter=2,
        keepWithNext=True,
    ),
    "toc": ParagraphStyle(
        "AtlasTOC", parent=BASE["BodyText"], fontName=FONT, fontSize=7.5,
        leading=10, leftIndent=0, firstLineIndent=0, textColor=colors.HexColor("#18392d"),
    ),
    "small": ParagraphStyle(
        "Small", parent=BASE["BodyText"], fontName=FONT, fontSize=7,
        leading=9.5, textColor=colors.HexColor("#536158"), spaceAfter=4,
    ),
}


def clean(value: object) -> str:
    text = str(value or "")
    return " ".join(text.split())


def safe(text: object) -> str:
    return escape(clean(text))


def setup_path(row: dict) -> str:
    name = safe(row.get("name") or row["domain"])
    parent = row.get("supported_by")
    if parent:
        return (
            f"Use the supporting integration <font name='{BOLD}'>{safe(parent)}</font> "
            "to add this brand. Open that integration's local guide from the directory."
        )
    if row.get("config_flow"):
        action = "Create helper" if row.get("integration_type") == "helper" else "Add integration"
        return (
            "In Home Assistant, open <b>Settings → Devices &amp; services</b>, choose "
            f"<b>{action}</b>, then search for <b>{name}</b>."
        )
    if row.get("steps"):
        names = ", ".join(safe(step) for step in row["steps"])
        return f"The catalog lists these setup steps: {names}. Follow the local reference for prerequisites and exact procedure."
    return (
        "The catalog does not identify an in-product setup flow. Use the local reference "
        "for the integration domain and available maintainer details."
    )


def content_for(row: dict) -> list:
    blocks = []
    summary = clean(row.get("summary")) or f"Home Assistant integration for {clean(row.get('name') or row['domain'])}."
    blocks += [Paragraph("Overview", STYLES["label"]), Paragraph(safe(summary), STYLES["body"])]
    blocks += [Paragraph("Setup path", STYLES["label"]), Paragraph(setup_path(row), STYLES["body"])]

    fields = []
    for step, values in (row.get("steps") or {}).items():
        if values:
            fields.append(f"{safe(step)}: {', '.join(safe(value) for value in values)}")
    if fields:
        blocks += [Paragraph("Catalog setup fields", STYLES["label"]), Paragraph("<br/>".join(fields), STYLES["body"])]

    details = []
    for key, label in (("integration_type", "Type"), ("iot_class", "Connection"), ("connectivity", "Connectivity"), ("platforms", "Entities"), ("actions", "Actions")):
        value = row.get(key)
        if value:
            if isinstance(value, list):
                value = ", ".join(clean(item).replace("_", " ") for item in value)
            details.append(f"<b>{label}:</b> {safe(value)}")
    if details:
        blocks += [Paragraph("Capabilities and connection", STYLES["label"]), Paragraph("<br/>".join(details), STYLES["body"])]

    topics = [clean(topic) for topic in (row.get("topics") or []) if clean(topic)]
    if topics:
        blocks += [Paragraph("Article topics", STYLES["label"]), Paragraph(" · ".join(safe(topic) for topic in topics), STYLES["body"])]

    excerpts = row.get("article_text") or []
    excerpt = next((clean(pair[1]) for pair in excerpts if len(clean(pair[1])) > 30), "")
    if excerpt:
        blocks += [Paragraph("Documentation note", STYLES["label"]), Paragraph(safe(excerpt), STYLES["body"])]

    route = f"../integrations/{row['domain']}/index.html"
    blocks.append(Paragraph(f'<link href="{escape(route)}" color="#176b4d">Open the local guide page →</link>', STYLES["small"]))
    return blocks


class AtlasDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(filename, pagesize=PAGE, leftMargin=22, rightMargin=22, topMargin=25, bottomMargin=26,
                         title="Home Assistant Integration Atlas: Offline Guide",
                         author="Integration Atlas", subject="Searchable offline guide to 1,658 Home Assistant integrations")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="phone")
        self.addPageTemplates(PageTemplate(id="phone", frames=frame, onPage=self.footer))

    @staticmethod
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#d7ded9"))
        canvas.line(22, 19, PAGE[0] - 22, 19)
        canvas.setFont(FONT, 6.5)
        canvas.setFillColor(colors.HexColor("#68746d"))
        canvas.drawString(22, 10, "Integration Atlas · Offline edition")
        canvas.drawRightString(PAGE[0] - 22, 10, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "IntegrationTitle":
            title = flowable.getPlainText()
            key = getattr(flowable, "bookmark_name", None)
            if key:
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(title, key, level=0, closed=True)
                self.notify("TOCEntry", (0, title, self.page, key))


def make_story(rows: list[dict], revisions: dict) -> list:
    story = [
        Spacer(1, 45),
        Paragraph("Integration Atlas", STYLES["cover_title"]),
        Paragraph(f"Offline field guide · {len(rows):,} integrations", STYLES["section"]),
        Paragraph(
            "A searchable, phone-size reference with a concise summary, catalog setup path, "
            "available capability metadata, article topics, and an internal link to each local guide page.",
            STYLES["cover_sub"],
        ),
        Spacer(1, 10),
        Paragraph("How to use this guide", STYLES["label"]),
        Paragraph(
            "Use your PDF reader's search or bookmarks to find an integration. Each entry is a "
            "concise catalog guide; its local page link opens the fuller site reader when the atlas is available.",
            STYLES["body"],
        ),
        Paragraph("Attribution and scope", STYLES["label"]),
        Paragraph(
            "Home Assistant documentation excerpts are adapted from Home Assistant Documentation "
            "contributors under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International "
            "(CC BY-NC-SA 4.0). "
            "Integration metadata is collected from Home Assistant Core, Home Assistant Material, and "
            "the Material integration package collection. This concise edition is not a substitute for "
            "complete upstream articles or wiki content.",
            STYLES["small"],
        ),
        Paragraph("Source revisions recorded in the catalog", STYLES["label"]),
    ]
    for label, revision in sorted(revisions.items()):
        story.append(Paragraph(f"{safe(label)}: {safe(revision)}", STYLES["small"]))
    story += [PageBreak(), Paragraph("Contents", STYLES["section"])]
    toc = TableOfContents()
    toc.levelStyles = [STYLES["toc"]]
    story += [toc, PageBreak()]

    for number, row in enumerate(rows, 1):
        name = clean(row.get("name") or row["domain"])
        title = Paragraph(safe(name), STYLES["entry"])
        title.bookmark_name = f"integration-{number}"
        story.append(title)
        story.append(Paragraph(f"Domain: <font name='{BOLD}'>{safe(row['domain'])}</font>", STYLES["domain"]))
        story.extend(content_for(row))
        if number != len(rows):
            story.append(PageBreak())
    return story


def check_pdf(path: Path, expected_domains: list[str]) -> tuple[int, int]:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path), strict=True)
        if reader.is_encrypted:
            raise RuntimeError("PDF is encrypted")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        pages = len(reader.pages)
        missing = [domain for domain in expected_domains if f"Domain: {domain}" not in text]
        if missing:
            raise RuntimeError(f"PDF text check is missing {len(missing)} domain labels; first: {missing[:8]}")
        if len(reader.outline) != len(expected_domains):
            raise RuntimeError(f"PDF outline has {len(reader.outline)} entries for {len(expected_domains)} domains")
        for page in reader.pages:
            box = page.mediabox
            if abs(float(box.width) - PAGE[0]) > 0.2 or abs(float(box.height) - PAGE[1]) > 0.2:
                raise RuntimeError(f"Unexpected page size {float(box.width):.1f} × {float(box.height):.1f} pt")
        linked = set()
        for page in reader.pages:
            for annotation in page.get("/Annots", []):
                action = annotation.get_object().get("/A")
                if action and action.get("/URI") is not None:
                    target = str(action["/URI"])
                    parsed = urlsplit(target)
                    if parsed.scheme or parsed.netloc or target.startswith("/"):
                        raise RuntimeError(f"PDF contains a non-local link: {target}")
                    linked.add(target)
        expected_links = {f"../integrations/{domain}/index.html" for domain in expected_domains}
        if linked != expected_links:
            raise RuntimeError(f"PDF guide links differ from catalog domains: missing {len(expected_links-linked)}, extra {len(linked-expected_links)}")
    except ImportError:
        info = subprocess.run(["pdfinfo", str(path)], check=True, capture_output=True, text=True).stdout
        match = re.search(r"^Pages:\s+(\d+)$", info, re.M)
        if not match:
            raise RuntimeError("Could not read PDF page count")
        pages = int(match.group(1))
        with tempfile.NamedTemporaryFile(suffix=".txt") as extracted:
            subprocess.run(["pdftotext", str(path), extracted.name], check=True)
            text = Path(extracted.name).read_text(errors="replace")
        missing = [domain for domain in expected_domains if domain not in text]
        if missing:
            raise RuntimeError(f"PDF text check is missing {len(missing)} catalog domains; first: {missing[:8]}")
    if pages < len(expected_domains):
        raise RuntimeError(f"Expected at least {len(expected_domains)} phone-size pages, found {pages}")
    if len(text.strip()) < len(expected_domains) * 20:
        raise RuntimeError("Extracted PDF text is unexpectedly short")
    return pages, len(text)


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    rows = catalog["integrations"]
    domains = [row.get("domain", "") for row in rows]
    if not rows:
        raise RuntimeError("Catalog contains no integration entries")
    if len(set(domains)) != len(domains) or any(not re.fullmatch(r"[a-z0-9_]+", domain) for domain in domains):
        raise RuntimeError("Catalog contains duplicate or invalid integration domains")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = AtlasDocTemplate(str(OUTPUT))
    doc.multiBuild(make_story(rows, catalog.get("revisions", {})))
    pages, extracted_chars = check_pdf(OUTPUT, domains)
    print(f"Built {OUTPUT.relative_to(ROOT)}: {len(rows)} integrations, {pages} pages, {OUTPUT.stat().st_size:,} bytes, {extracted_chars:,} searchable extracted characters")


if __name__ == "__main__":
    main()
