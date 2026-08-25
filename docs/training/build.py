"""
Build training PDFs from markdown sources.

Usage:
    cd docs/training
    pip install -r requirements.txt
    python build.py                  # build all 3 PDFs
    python build.py 01               # build only 01_generate_inspection
    python build.py --watch          # rebuild on src changes (not yet impl.)

Reads each *.md in src/, splits on the marker  <!--LANG_DIVIDER-->  to
separate the English and Arabic sections, wraps the Arabic side with
dir="rtl" lang="ar", and renders the combined HTML to PDF via WeasyPrint.

The first H1 in the English section becomes the cover-page title (string-set:
doc-title) and the running footer.
"""
from __future__ import annotations

import os
import platform
import re
import sys
from pathlib import Path

# WeasyPrint on macOS needs Homebrew's pango/glib/cairo libs at runtime.
# Inject /opt/homebrew/lib into the dynamic loader path BEFORE importing.
if platform.system() == "Darwin":
    brew_lib = "/opt/homebrew/lib"
    if Path(brew_lib).is_dir():
        existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
        if brew_lib not in existing.split(":"):
            os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = (
                f"{brew_lib}:{existing}" if existing else brew_lib
            )

import markdown  # noqa: E402
from weasyprint import HTML, CSS  # noqa: E402

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
CSS_FILE = ASSETS / "training.css"

LANG_DIVIDER_MARKER = "<!--LANG_DIVIDER-->"

MD_EXTENSIONS = [
    "extra",
    "tables",
    "fenced_code",
    "attr_list",
    "md_in_html",
    "sane_lists",
]


def render_markdown(text: str) -> str:
    return markdown.markdown(text, extensions=MD_EXTENSIONS, output_format="html")


def split_languages(md_text: str) -> tuple[str, str | None]:
    """Return (english_md, arabic_md_or_none) split on LANG_DIVIDER marker."""
    if LANG_DIVIDER_MARKER in md_text:
        en, ar = md_text.split(LANG_DIVIDER_MARKER, 1)
        return en.strip(), ar.strip()
    return md_text.strip(), None


def extract_title(md_text: str) -> str:
    """Pull the first markdown H1 as the document title."""
    m = re.search(r"^#\s+(.+?)$", md_text, re.MULTILINE)
    return m.group(1).strip() if m else "Inspection System Training"


def build_html(md_path: Path) -> str:
    raw = md_path.read_text(encoding="utf-8")
    en_md, ar_md = split_languages(raw)
    title = extract_title(en_md)

    en_html = render_markdown(en_md)
    ar_block = ""
    if ar_md:
        ar_html = render_markdown(ar_md)
        ar_block = (
            '<div class="lang-divider">'
            '<div><span class="label">Arabic Edition</span>'
            '<span dir="rtl" lang="ar">النسخة العربية</span></div>'
            "</div>"
            f'<section dir="rtl" lang="ar">{ar_html}</section>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
</head>
<body>
<section lang="en">{en_html}</section>
{ar_block}
</body>
</html>"""


def build_pdf(md_path: Path, out_dir: Path) -> Path:
    pdf_path = out_dir / f"{md_path.stem}.pdf"
    html_str = build_html(md_path)
    css = CSS(filename=str(CSS_FILE))
    # base_url is the markdown source's directory so that ../screenshots/...
    # paths resolve the same way you'd see them when reading the .md file.
    HTML(string=html_str, base_url=str(md_path.parent) + "/").write_pdf(
        str(pdf_path), stylesheets=[css]
    )
    return pdf_path


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: {SRC} does not exist", file=sys.stderr)
        return 1

    sources = sorted(SRC.glob("*.md"))
    if not sources:
        print(f"No markdown files in {SRC}", file=sys.stderr)
        return 1

    arg = sys.argv[1] if len(sys.argv) > 1 else None
    if arg:
        sources = [p for p in sources if arg in p.stem]
        if not sources:
            print(f"No source matches '{arg}'", file=sys.stderr)
            return 1

    for md in sources:
        print(f"Building {md.name} ...", end=" ", flush=True)
        out = build_pdf(md, ROOT)
        print(f"-> {out.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
