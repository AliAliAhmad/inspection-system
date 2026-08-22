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

- **2026-08-22 (2)** — **SAP order parser + PM priority rules, built against the real exports.** The courier now delivers 27 files (208 MB) daily, so this is the half that reads them. Pipeline: 19,283 IW39 rows → MES only → plannable status → **209 candidates** (26 hourly PM, 52 calendar PM, 131 corrective), equipment parsed **210/210**. **SAP's `Priority` field is ignored entirely** — 51% of open orders are priority 1 vs 2.3% of finished ones, and every one is 90+ days old (median 344), so it marks stale backlog, not urgency; Ali's hypothesis that it tracked equipment type was tested and rejected (~93% priority 3 across every family). **Status rule (Ali):** must carry `CRTD`/`REL`, must not carry `CLSD`/`TECO`/`CNF` — tokenised, because an order can be fully confirmed before TECO and a "not TECO" test would plan finished work. **Calendar PM priority:** days since created (>10 urgent, >5 high) **OR** >60 days since that service last completed → urgent, whichever is worse; matched on maintenance plan, not equipment. That second signal exists because the first lies — TT031's order was 7 days old but the service was **376 days** overdue. **Hourly PM priority:** interval is **always 250h** between services of a plan (the 250/500/1000/2000/4000HR variants are nested task lists, not different intervals — matching on package level produced nonsense); hours run from IK17 counters; past-by->20 and past-by-≤20 both map to `urgent` (no "top urgent" in the CHECK constraint) but **`hours_past_due` is returned so the generator can rank within the tier**; a replaced meter returns `None`, never a guessed priority. **Traps found:** `Actual finish` is a TIME column (the date is `Actual Order Finish Date`); a blank `MaintActivityType` was silently dropping a real PM; IW49 has hours for 5,539/5,548 **finished** orders but **zero** open ones, so learned medians per (activity × equipment family) are the only viable estimate source (PRM on TR = 18.0h vs a blanket 4.0h default). **Flagged, unresolved:** every hourly machine reads under 5 h/day (RS115 0.44) against SAP's own 3,500 h/year estimate — a 20× gap. Ali reviewed all 26 rows and judged them acceptable, so the rule is built on the meter, but it currently reports "not due" for 22 of 26 orders SAP has raised. Also: FL311 has **three** open orders for one service. Tests: `test_sap_order_parser.py` (47), suite **290 passed**.

- **2026-08-22** — **Two production bugs closed, ahead of the SAP-sync programme.** Both found while grilling the Telegram/robot plan, both unrelated to it. **(a) Anyone logged in could regenerate the week's plan.** `/generate`, `/generate/reject`, `/score` and `/generate/preview` carried only `@jwt_required()` — an inspector, specialist or maintenance hand could rebuild the whole plan. Now `admin` + `engineer` only, via a new `PLANNING_ROLES` constant; `quality_engineer` was **deliberately dropped** from `engineer_or_admin_required` (QEs review work, they don't author plans; nobody holds it as a primary role — it exists only as the auto-paired *minor* role of engineer, so nobody is locked out, and a new `before_request` one-shot check logs loudly if that ever stops being true). **Trap:** all four handlers wrap their body in `except Exception`, so a guard placed inside the `try` would return 403 as **500** — the guards sit outside it, and the tests assert the status code precisely to prove that. Also removed the **full traceback** the 500 response was returning to callers. **(b) Removing a job erased the crew's work.** `_delete_job_record` hard-`DELETE`d `work_plan_job_trackings`, `work_plan_assignments`, `work_plan_materials` and `job_checklist_responses` — who did it, hours, checklist, parts, all gone. Now: untouched jobs delete as before; **in-progress/paused/finished/rated are refused**. `Clear All Jobs` clears what it safely can and **reports what it kept** (`{deleted, kept, kept_jobs}`) instead of destroying a week of tracking. Also fixed a latent FK bug — `work_plan_job_ratings.work_plan_job_id` is a NOT NULL FK that was missing from both delete paths: **Postgres raised IntegrityError (500, job not removed); SQLite silently orphaned the rating row.** ⭐ Points and stars were never at risk (`point_history`/`star_history` key on `users.id`, no FK to the job) — an earlier claim of mine that I corrected. **Deliberately NOT done:** the "warn and force through, preserving the record" path for in-progress jobs — `work_plan_day_id` is NOT NULL so a job has nowhere to live off a day; that lands with the global-pool work. Tests: `test_planning_authorization.py` (14) + `test_job_removal_safety.py` (7), suite **232 passed**. Both sets **proven by stashing the fix** — 10/14 and 5/7 failed against the old code.
