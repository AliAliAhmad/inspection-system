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

### NEXT UP (agreed 2026-08-23) — make the plan realistic
- **Jobs-per-day / capacity rules.** The first real generate put **52 jobs · 143h on one
  Monday**. Decide what a day can actually hold — per berth, per trade, per crew — and
  make the generator respect it instead of overflowing into the first available day.
- **Rank WITHIN urgent.** 40 of 133 SAP orders are urgent and 33 more are high, so the
  label has stopped sorting anything. The numbers to rank by are already stored:
  `overdue_value` (days for calendar PMs and correctives, hours past 250 for hourly).
- **~2,000 legacy `sap_work_orders`** stamped to plans 6-38. Invisible to the box but
  they broke one cleanup already. `UniqueConstraint('work_plan_id','order_number')` is a
  leftover from per-week pools — one order should mean one row.
- **Removal-rule recipients:** all 8 admins+engineers today; Ali is meant to be the
  filter. Undecided.

### Other
- Full QA testing needed (496 passing)
- Add TOGETHER_API_KEY on Render (key ready)
- GROQ_API_KEY returns 401 and OPENAI has no credits — Arabic notification text
  falls back to English (cached + circuit-broken now, so it is quiet, not fixed)
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

- **2026-08-24** — **The carry-over: a finished week gives its work back, and one order now means one row.** Ali's rule from day one — *"if the week finish and the job not done it will back to the box"* — was never implemented, so ten finished weeks were still holding **2,242 orders** (6:257, 7:288, 8:276, 9:301, 11:289, 13:207, 31:195, 37:179, 38:181, 40:69). Nothing was lost, because the nightly rebuild saw them still open in SAP and made **fresh copies** — which is exactly how the table reached 2,436 rows for ~200 real orders, and why `/generate` died on a UniqueViolation. **Shipped disabled**, with a read-only `classify()` checked against production first; the one number worth doubting (`left_alone_because_worked: 0`) was **verified separately rather than trusted** — the only 4 worked jobs in those weeks are defect/manual jobs carrying no SAP order, so there was nothing for the rule to protect. Live result: **2,436 rows → 194**, 344 carried back, 1,898 duplicates deleted, 0 worked jobs touched. Then `UniqueConstraint('work_plan_id','order_number')` — a leftover from per-week pools — was tightened to **UNIQUE(order_number)**, which turned "we no longer create duplicates" into "the database refuses them". That surfaced a real risk the constraint introduces: a row **stamped to a live plan with no job** (plan 40 had 69) would have made the sync create a second row and abort the whole rebuild, so those are now **reclaimed to the box** instead — a row nobody has a job for is pool stock wearing the wrong label. Also: **inspections collapse to one line** in the bot (`🔍 Inspections today: TT006, TT021`) instead of a five-line card each, and are out of the day's job count and hours. Suite **519 passed**, mutation-verified throughout.

- **2026-08-23 (10)** — **My duplicate cleanup emptied the pool: 202 → 21.** The rule "delete a box row whose order number is already stamped to a plan" was implemented as `work_plan_id IS NOT NULL` — but **~2,000 rows are legacy per-week imports** stamped to plans from weeks long finished (6, 7, 8, 9, 11, 13, 31, 37, 38). Every one read as *"already planned"*, so every fresh box copy was deleted. **"Has a foreign key" is not "is being used"** — and since a stale FK is exactly what a cleanup exists to remove, using it as the protection made the rule protect its own targets. Now "planned" means a real **`WorkPlanJob` on a day of a week that has not ended**, which also frees the 69 stranded rows on plan 40 (stamped, but their jobs were cleared). The box refills on the next rebuild. Two tests added for the shapes I had not checked: a stamp from an old week, and a stamp with no job. Also: **the translation service was thrashing** — every notification ran all 8 providers, all failing (gemini 429, groq 401, openai no credits, ollama absent in a cloud container), ~6s of network waiting per message on ONE worker, and re-translating the same template strings endlessly. Added a bounded cache (a day for successes, 5 min for failures) and a per-provider circuit breaker. Suite **495 passed**.

- **2026-08-23 (9)** — **`/generate` died with a UniqueViolation, and the error handler hid it.** Two bugs, both mine. (a) **The sync matched existing orders among BOX rows only** (`work_plan_id IS NULL`), so an order already scheduled into a week was not found and a **second row was created for it**. `UniqueConstraint('work_plan_id','order_number')` then fired the moment the generator tried to stamp the box copy with that plan. It is also where production's **2,375 rows** came from, against ~200 real ones. Fixed by separating two questions that had been one query: *what is in the box* (all box rows — staleness needs them) and *is this order already planned* (all rows for the candidate numbers). A planned order is now **left completely untouched**, and box copies whose number is already stamped to a plan are deleted, so the existing damage self-heals on the next rebuild. (b) **The error handler was the second error:** `logger.exception('... %s', plan.id)` read `plan.id` after a failed flush, raising `PendingRollbackError` from inside the handler — so the real `UniqueViolation`, which named the exact colliding key, was replaced on the phone by "Something went wrong. It is logged." Now: roll back first, capture the id before the call, and **the bot states the exception** rather than pointing at a log nobody can reach from a phone. Suite **480 passed**, mutation-verified.




