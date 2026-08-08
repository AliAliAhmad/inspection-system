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

- **2026-08-08** — **Work-planner drag & drop performance**. Diagnosed why dragging felt slow. Root causes: (1) zero optimistic updates — every drop waited for `POST` *then* a full `include_days=true` refetch before the card moved; (2) bundle drags fired one mutation **per job**, each with its own invalidation + refetch + toast (the "React Query will batch" comment was wrong); (3) `BundleCard` was the only work-planning component without `React.memo`, so every bundle re-rendered on each drag start/end. Fixes: new backend `POST /jobs/bulk-move` + `/jobs/bulk-delete` (single transaction, single commit; `remove_job` body extracted to shared `_delete_job_record` so pool semantics stay identical); optimistic `onMutate`/`onError`/`onSettled` cache patching on move/remove/bulk mutations; `BundleCard` memoized with a custom comparator + `handleJobClick` wrapped in `useCallback`. Also wired up `bulkMoveJobs`/`bulkDeleteJobs`, which existed in `work-plans.api.ts` but had **no backend route** (would have 404'd). Tests: `test_work_plan_bulk_jobs.py` (9, suite 171 passed) + new Playwright spec `e2e/work-planner-dragdrop.spec.ts` (2) which **holds the bulk-move response open** to prove the board updates while the request is still in flight, and forces a 500 to prove rollback. Browser-verified end to end against a local seeded backend. **Follow-up (same day): payload duplication removed** — `WorkPlanDay.to_dict` no longer emits a flat `jobs` list alongside the berth arrays (each job was serialized twice). Measured **44% smaller** plan payload, and the share grows with job count. Verified nothing consumed it: PDF walks the ORM, version snapshots build their own structure, `/my-plan` is a separate shape, and both mobile admin screens read berth arrays only. Suite 173 passed; web + mobile tsc show no new errors; E2E still green.

- **2026-06-27** — New **'corrective'** job type for manual Add-Job (web + backend). Lets you add a brand-new field-found fix without linking to an already-registered defect: corrective needs equipment + a description, no defect record. CHECK constraints (`check_job_type`/`check_sap_job_type`) extended to include 'corrective' (models + idempotent `start.sh` patch); `add_job`/`remove_job`, shared `JobType`, all web/mobile/PDF displays (gold "CORR") handle it. Tests: `test_work_plan_corrective.py` (4). Suite 162 passed. Full detail in HISTORY.md.

- **2026-06-27** — Fixed `Leave` wrong-field-name bug (caused `/api/schedule-ai/insights` 500: "type object 'Leave' has no attribute 'start_date'"). Code referenced `Leave.start_date`/`end_date` but the model fields are `date_from`/`date_to`. Fixed in 3 services: `schedule_ai_service.py`, `work_plan_ai_service.py` (worker-availability check), `notification_ai_service.py` (leave-impact analysis). Suite 158 passed.

