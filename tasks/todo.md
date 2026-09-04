# Inspection System — Todo

## Parked — talk later

### Move the server region (Oregon -> Frankfurt)
Raised 2026-09-05. Ali: "keep it in the todo list only, we will talk later."

**Why:** every request travels ~10,000 km to Oregon. Measured: DB queries ~10 ms warm,
but `/health` warm round trip ~0.99 s, and the planning page fires 10 `useQuery` calls.
Frankfurt is ~3,000 km — roughly 3x less travel on every screen.

**Blocker:** Render cannot change a service's region in place. It means creating new
services and retiring the old ones — a migration, not a move.

**Do this first (makes the move nearly free):** put a custom domain on the API
(e.g. `api.tellhamgroup.com`) while still on Oregon, and point the web app, the mobile
app and the terminal-PC courier at that name ONCE. After that, moving region is a DNS
change and nothing else has to be touched on the same day.

**Hardcoded to the Oregon URL today:**
- `render.yaml:35` CORS_ORIGINS
- `render.yaml:82` VITE_API_URL in the build command
- `render.yaml:97` Content-Security-Policy (`connect-src`, `media-src`)
- `render.yaml:106` VITE_API_URL env var
- `frontend/apps/mobile/src/config/environment.ts:13,18,23` — all three profiles
- the courier on the terminal PC (not in this repo)
- the Telegram webhook registration

**Risks:** free Postgres has no automatic backups (manual `pg_dump` is the only restore
point); the 1 GB disk at `/app/instance/uploads` must be copied by hand; ~30-60 min of
downtime; the courier fails SILENTLY if its URL is not updated.

**Cost:** region does not change the price. Brief double-billing during overlap
(API is `plan: starter`). Domain ~$10-15/yr, SSL free.

**Check on the dashboard before starting:** does a NEW free Postgres carry an expiry
date that the current grandfathered one does not? And does the current DB size still
fit the free cap?

**Cheaper alternative, zero risk:** cut the planning page from 10 requests to 3-4.
Wins most of the same speed with no downtime and no migration.

## Done
- Per-job sub-tasks / notes that stick to the job (2026-09-05). Built, 929 tests green,
  NOT yet pushed or deployed. Needs a Render restart for `start.sh` to create
  `work_plan_job_tasks`, and a mobile OTA for the worker's tick screen.

## Known, pre-existing, NOT caused by this work
Four TypeScript errors in the mobile app, all in unrelated screens:
- `src/components/quality/PunchListPanel.tsx:170` — Expected 2 arguments, but got 1
- `src/screens/inspector/InspectionWizardScreen.tsx:170` — `colleagueData` used before declaration
- `src/screens/shared/LeaderboardScreen.tsx:326` — TFunction not assignable
- `src/storage/storage-cleanup.ts:307` — `size` not in `InfoOptions`
