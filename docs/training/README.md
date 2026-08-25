# Training PDFs

Bilingual (English + Arabic) end-user training material for the Inspection System.
Each PDF covers one workflow:

| File | Workflow | Audience |
|------|----------|----------|
| `01_generate_inspection.pdf` | Generate a daily inspection list | Engineer / Admin |
| `02_assign_inspection.pdf`   | Assign inspectors to equipment | Engineer / Admin |
| `03_create_work_plan.pdf`    | Generate and manage a weekly work plan | Engineer / Admin |

## How to build

### Prerequisites (macOS)

```bash
# System libs WeasyPrint needs (HTML→PDF rendering)
brew install pango glib cairo harfbuzz fontconfig

# Arabic font — required for the Arabic section to render correctly.
# Without this, headings show scrambled glyphs (Geeza Pro alone is not sufficient).
brew install --cask font-noto-sans-arabic
```

### Build

```bash
cd docs/training
uv venv .venv --python 3.13   # or: python3.13 -m venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt   # or: pip install -r requirements.txt
python build.py
```

PDFs are written to `docs/training/*.pdf`. Build a single one with:

```bash
python build.py 01      # only 01_generate_inspection.pdf
```

## How to edit

1. Edit the markdown source in `src/<file>.md`.
2. Each source has two halves separated by `<!--LANG_DIVIDER-->`:
   - English first
   - Arabic (RTL) second
3. Re-run `python build.py` to regenerate.

## How to refresh screenshots

Screenshots live under `screenshots/<workflow>/`. Re-capture via Playwright by
re-running the capture session in `tools/capture_screenshots.py` (created during
the screenshot phase) — or replace any PNG manually keeping the same filename.

## Stack

- `markdown` — markdown → HTML
- `weasyprint` — HTML → PDF (RTL/Arabic support, A4 print styles)
- `pygments` — code highlighting

CSS theme: `assets/training.css`.

## Conventions

- A4 paper, 18mm/16mm margins.
- Cover page is printed full-bleed (gradient).
- English section first, then a single-page divider, then Arabic mirror.
- Page footer: filename (left) + page X / Y (center). Reversed for RTL pages.
