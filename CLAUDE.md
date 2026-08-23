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

- **2026-08-23 (6)** — **`/pool` on the phone, and the rebuild runs itself.** The daily pipeline had a manual step that could only be reached through a shell session that drops on a weak connection. Now: **05:00 Baghdad nightly rebuild** (an hour before the 06:00 push, so it reads fresh data), behind the same cross-worker lock as the manual trigger. **`/pool`** answers "did my SAP files turn into jobs" — box count split by priority and type, what the last rebuild created/updated/removed, equipment matched, and **unmatched plant codes NAMED, never merely counted**: that is the one failure in this pipeline that is otherwise invisible, since dropped orders just make the planner look empty. The rebuild report is persisted to the **persistent disk as JSON, not a table** — start.sh runs `flask db upgrade || echo WARNING`, so a failed migration does not stop the boot and the table would silently not exist. Written tmp-then-renamed, so a crash mid-write leaves the previous report intact. **Dry runs are stored separately**, or "what did the robot do last night" could answer "nothing, it was a rehearsal". Tests: 63 in `test_telegram_bot.py`, mutation-verified (hiding the unmatched codes, or counting scheduled orders as still in the box, each break a test). Suite **453 passed**.

- **2026-08-23 (5)** — **The parse was being killed by the kernel, and two schedulers were running.** Both found while getting the bot live. (a) **`usecols` does not mean "read less".** `pd.read_excel(usecols=...)` filters what pandas RETURNS; openpyxl still builds the whole worksheet. Measured peak on the real exports: **647 MB against a 512 MB container** — killed with no traceback, which looked exactly like a job that never finished (three rounds of shell diagnostics went into "is it still running?" before anyone measured memory). Now streams with `load_workbook(read_only=True)`: **276 MB**, and proven **byte-identical across 305,000 rows of five real exports** (IW39/IW49/IK17/IW47/IW28) before being trusted. Raw workbook bytes are released as soon as they are parsed (~50 MB of dead weight). Two behaviours had to be matched deliberately: a **phantom trailing row** (a worksheet's declared range over-reports; IW49 gained one) and **cells holding empty STRINGS** (IK17's last row is 85 `''`, not 85 `None`). Only TRAILING blanks are trimmed — a gap in the middle is real data. (b) **Every scheduled job was firing twice.** `init_scheduler` runs inside `create_app` and `render.yaml` sets `GUNICORN_WORKERS=2`. The 26 older jobs tolerated it; the new Telegram pushes would not, and the first-ever 16:00 message would have arrived doubled — the exact nag failure the bot exists to avoid. A mutex alone does not fix it (both workers fire milliseconds apart, so a quickly-released lock is simply re-taken), so the claim records WHEN the job last ran. File lock on the persistent disk, **failing OPEN** — running twice is survivable, silently stopping all 28 jobs is not. Verified across 4 forked processes: exactly 1 wins. Same fix replaces `_REBUILD_LOCK`, which was `threading.Lock` and so let the other worker run a second reconciliation over the same rows. Suite **444 passed**.
