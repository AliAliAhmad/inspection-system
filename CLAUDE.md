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

- **2026-08-22** — **Two production bugs closed, ahead of the SAP-sync programme.** Both found while grilling the Telegram/robot plan, both unrelated to it. **(a) Anyone logged in could regenerate the week's plan.** `/generate`, `/generate/reject`, `/score` and `/generate/preview` carried only `@jwt_required()` — an inspector, specialist or maintenance hand could rebuild the whole plan. Now `admin` + `engineer` only, via a new `PLANNING_ROLES` constant; `quality_engineer` was **deliberately dropped** from `engineer_or_admin_required` (QEs review work, they don't author plans; nobody holds it as a primary role — it exists only as the auto-paired *minor* role of engineer, so nobody is locked out, and a new `before_request` one-shot check logs loudly if that ever stops being true). **Trap:** all four handlers wrap their body in `except Exception`, so a guard placed inside the `try` would return 403 as **500** — the guards sit outside it, and the tests assert the status code precisely to prove that. Also removed the **full traceback** the 500 response was returning to callers. **(b) Removing a job erased the crew's work.** `_delete_job_record` hard-`DELETE`d `work_plan_job_trackings`, `work_plan_assignments`, `work_plan_materials` and `job_checklist_responses` — who did it, hours, checklist, parts, all gone. Now: untouched jobs delete as before; **in-progress/paused/finished/rated are refused**. `Clear All Jobs` clears what it safely can and **reports what it kept** (`{deleted, kept, kept_jobs}`) instead of destroying a week of tracking. Also fixed a latent FK bug — `work_plan_job_ratings.work_plan_job_id` is a NOT NULL FK that was missing from both delete paths: **Postgres raised IntegrityError (500, job not removed); SQLite silently orphaned the rating row.** ⭐ Points and stars were never at risk (`point_history`/`star_history` key on `users.id`, no FK to the job) — an earlier claim of mine that I corrected. **Deliberately NOT done:** the "warn and force through, preserving the record" path for in-progress jobs — `work_plan_day_id` is NOT NULL so a job has nowhere to live off a day; that lands with the global-pool work. Tests: `test_planning_authorization.py` (14) + `test_job_removal_safety.py` (7), suite **232 passed**. Both sets **proven by stashing the fix** — 10/14 and 5/7 failed against the old code.
