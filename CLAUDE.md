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

- **2026-06-16** — Route defects through the Work Plan + unify worker features. Defects are now scheduled via the work plan (engineer assigns specialist+day) instead of dumped directly on a specialist; direct "Assign" is demoted to an "Urgent" path (web `DefectsPage`). Added a double-booking guard so a defect can't be both a SpecialistJob and a WorkPlanJob (`work_plans.py`, `defects.py`). Added worker planned-time entry + AI estimate to ALL work-plan jobs (new `WorkPlanJob.planned_time_hours`, endpoints `POST /work-plan-tracking/jobs/<id>/planned-time` and `/ai-estimate-time` tuned per job type; defect estimates learn from SpecialistJob history). `start_job` now requires planned time; `rate_job` time-rating uses planned_time (fallback estimated_hours). Mobile My Work Plan gained the AI planned-time modal. Migration `m3n4o5p6q7r8` + start.sh schema-patch. Points/QC reuse the existing engineer daily-review flow (no QE gate). Added `tests/test_work_plan_defect_routing.py` (6 tests: planned-time enforcement, AI estimate, double-booking guard). Full suite: 143 passed, 15 deselected. (Repaired a corrupted local venv — `requests`/`pip`/`pygments` had missing files — via ensurepip + force-reinstall.)
- **2026-06-12** — Fixed published work plans not appearing in workers' "My Plan" (mobile + web). Web planner creates plans with Sunday `week_start`, but `/my-plan` normalized requests to Monday and exact-matched — so non-Monday plans were never found. Backend now matches the published plan whose `week_start..week_end` range contains the requested date (`app/api/work_plans.py` `get_my_plan`).
- **2026-06-12** — Fixed very tall stat cards on mobile. Horizontal stats ScrollViews were absorbing leftover vertical space (RN ScrollView defaults to `flexGrow: 1`), stretching StatCards. Added `flexGrow: 0` in `SpecialistJobsScreen` (+ `alignItems: 'center'` on content) and `AllInspectionsScreen`; replaced the `maxHeight: 90` workaround with `flexGrow: 0` in `AllSpecialistJobsScreen`. Other StatCard screens verified safe (nested in vertical ScrollViews/list headers).
