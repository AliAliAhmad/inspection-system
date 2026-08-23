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

- **2026-08-23 (2)** — **The parser is connected to the pool — the chain is complete.** `POST /api/sap-sync/rebuild-pool` reads the newest delivered IW39/IW49/IK17 + Ali's maintenance-plan sheet, parses, prices and writes the candidates into the box (`work_plan_id NULL`). It is a **reconciliation, not an append**: new orders inserted, existing ones **updated** (the old importer skipped duplicates silently, which defeats a daily sync), and orders that have left SAP's open list **removed from the box** — so the generator can never schedule finished work. **A scheduled order is never touched**; that is planned work, possibly started, and belongs to the removal rules. **Estimated hours come from learned history**, not a flat default: IW49 has hours for 5,539 of 5,548 *finished* MES orders but **zero** open ones, so medians per (activity × equipment family) fill the gap — PRM on TR = **18.0h**, ECH 14.6, RS 12.0, TT 8.2, against the app's blanket 4.0. Falls back (pair → activity → overall → 4.0) so there is always an answer and none of it is invented. **Unmatched equipment is named in the report** — the one failure in this pipeline that is otherwise invisible, since dropped orders just make the planner look empty. **Two bugs the end-to-end caught that unit tests could not:** (a) `pd.Timestamp.utcnow()` is timezone-AWARE while parsed SAP dates are naive — every earlier test passed `today=` explicitly, so the crash only existed in production; now a naive Baghdad `_today_naive()`. (b) **IW39 was being parsed four times** (last-completion, breakdowns, durations, main parse) — **117s → 69s** once parsed once and shared, with those four steps dropping from 62s to 0.1s. IW49 is now the bottleneck at 36s. The rebuild therefore runs in a **background thread returning 202**, with a single-flight lock; `?dry_run=true` stays synchronous because seeing what *would* change is the whole point. Tests: `test_sap_pool_sync.py` (9) on tiny synthetic workbooks — the real ones take 69s; suite **333 passed**.
