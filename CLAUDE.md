# Inspection System

## Deployment

**Platform:** Render.com
**Auto-deploy:** From GitHub `main` branch

### Services

| Service | URL/Host | Description |
|---------|----------|-------------|
| inspection-api-o3hz | https://inspection-api-o3hz.onrender.com | Backend API (Flask) |
| inspection-web | https://inspection-web.onrender.com | Frontend Web (React) |
| dpg-d5uepavgi27c7395il90-a | PostgreSQL hostname | Database |

### Running Migrations
1. Go to Render Dashboard
2. Select the API service
3. Open Shell tab
4. Run: `flask db upgrade`

## Tech Stack
- **Backend:** Flask, SQLAlchemy, PostgreSQL
- **Frontend Web:** React, TypeScript, Ant Design
- **Frontend Mobile:** React Native, Expo
- **State:** React Query

## Key Rules
- Keep CLAUDE.md under 8KB. Move completed changelog entries to HISTORY.md.
- Full history in HISTORY.md (read when needed, not every time).
- NEVER commit or push to git without explicit user permission
- Always test locally first
- Support both Arabic (RTL) and English
- Use auto-fix loop: find → fix → verify → repeat
- Always explain what you're changing before doing it

## Current Issues / History
- Arabic analysis was returning English only — FIXED (bilingual prompts on all providers)
- WebSocket (flask-socketio) not installed — non-critical
- UI needs modernization and improvements

## What's Working
- Photo upload working
- Photo analysis working (English only)
- Database connected and healthy
- Deployed on Render (auto-deploy from main branch)
- AI fallback chains: 8 providers for photo, 6 for voice
- SambaNova + OpenRouter API keys configured on Render
- Together AI API key ready to add on Render

## What Needs Work
- ~~Arabic language support for AI analysis~~ ✅ Fixed
- Full QA testing needed (137 passing, 0 skipped, 15 remote-only deselected)
- Add TOGETHER_API_KEY on Render (key ready)
- Add GROQ_API_KEY on Render (biggest gap — free, 14,400 RPD audio)
- Google Gemini 429 quota: free tier limited to 5 RPM (known issue since Dec 2025)
- ~~New EAS build needed~~ ✅ Done — Build 934e89de (Android APK, preview profile)

## How to Run Locally
- Backend: `cd backend && flask run --debug`
- Frontend: `cd frontend && npm run dev`
- Local URL: http://localhost:5000 (API) / http://localhost:3000 (Web)

## Context for AI
- This is a bilingual inspection system for the Middle Eastern market
- Primary markets: Iraq, Lebanon, UAE, Saudi Arabia, Jordan
- Part of Tellham Group business
- Owner: Ali


## Change Log
See HISTORY.md for full changelog. Only keep last 3 entries here.

| 2026-04-07 | Feat: Replaced "Travel Efficiency" score with "Berth Balance" — measures workload split between East/West berths (since each berth has its own dedicated team, travel between berths is irrelevant). Formula: min(east,west)/max(east,west)*100. 3 files: work_plan_generator_service.py, work-plan.types.ts, PlanScoreCard.tsx. No DB migration needed | ✅ Done |
| 2026-04-07 | Feat: Combined recipe (3-step manual stepper) — New recipe in Smart Plan Generator where user controls 3 sequential steps: PMs+defects → urgent defects on eq without PM → normal defects on eq without PM. Each step additive, assigns teams automatically, user reviews between steps. Backend: +`step`/`additive` params on generate_plan, new `_filter_candidates_for_combined_step` helper, relaxed populate to include 'low' severity. Frontend: new 3-card stepper modal in GeneratePlanButton. Materials stay manual (documented in UI). No DB migration | ✅ Done |
| 2026-04-07 | Feat: Work Plan PDF filter panel — Clicking Generate PDF now opens a filter modal with 4 selectors: Days (multi-select), Berth (East/West/Both), Trade (Mechanical/Electrical/Both), Job Types (PM/Defect/Inspection multi-select). PDF only includes matching days+jobs; empty days are skipped; ELME jobs always appear in both trade filters. Same card layout, filter note printed on cover page. Backend: `_apply_filters_to_jobs`, `_build_filter_note`, extended `generate_plan_pdf()` signature, 2 endpoints updated. Frontend: new PdfFilterModal component + WorkPlanningPage wiring. No DB migration | ✅ Done |
| 2026-04-07 | Fix: PDF Arabic language was never reaching the backend — frontend was hardcoding English regardless of UI language. Added Language radio (English/العربية) to PdfFilterModal (defaults to current i18n.language), extended generatePdf() API client with `lang` param, all 3 PDF download call sites now pass `lang` query param. Backend filter note builder now localizes day names (e.g. "الإثنين, 6 أبريل") instead of leaving them in English | ✅ Done |
| 2026-04-07 | Fix: AC PM defects were riding free, overloading the defect team — Defect team capacity raised from 3 to 4 per day per berth. AC PM bundles with defects now consume defect team capacity (because AC specialist can't fix mech/elec defects — they go to the defect team). Day-columns view splits AC PM into its own bundle card so the visual matches the team split. Files: work_plan_generator_service.py, WorkPlanningPage.tsx | ✅ Done |
| 2026-04-07 | Feat: Running hours validation + admin edit — Catch inspector typos like 9000 instead of 900 BEFORE they pollute the history. New `validate_reading_against_history` service rejects readings that exceed last + (days × 20h/day + 20h buffer) for RNR, or last + (days × 200/day + 50 buffer) for TWL. Wired into the inspection upload path. Admin can correct any past reading via new PATCH `/api/equipment/{id}/readings/{rid}` endpoint with full audit trail (original_value, edit_count, updated_by, edit_reason). Frontend: new EditReadingModal with photo preview, max-realistic warning, and audit display in ReadingsHistoryTable. Requires `flask db upgrade` on Render to add 5 audit columns to equipment_readings | ✅ Done |


## Plugin Management
Core plugins are always enabled. For others, enable on demand then disable after:
- PR review: `/plugin enable code-review` → review → `/plugin disable code-review`
- Overnight run: `/plugin enable ralph-loop`
- Security audit: `/plugin enable security-guidance`
- New feature: `/plugin enable feature-dev`
- Build skills: `/plugin enable skill-creator`
Disable non-core plugins after use to keep performance fast.

## Mandatory Before Any Edit
- Before editing ANY file, ALWAYS run: git stash push -m "backup-before-edit" || true
- After completing the task successfully, drop the stash: git stash drop || true
- If something goes wrong, restore with: git stash pop
- NEVER skip the backup step. This is non-negotiable.
- Before deleting any function, component, route, or file — search the entire codebase for references first using grep/ripgrep. If ANY reference exists, DO NOT delete.
- NEVER remove code you didn't add in this session unless explicitly asked to remove THAT SPECIFIC code.
