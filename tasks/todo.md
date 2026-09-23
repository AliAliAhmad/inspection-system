# Inspection System — Todo

## Tomorrow (Ali, 2026-09-24: "put this task in the to do list we will look at it tomorrow")

### Security check + library upgrades — decide which of 1 / 2 / 3
The Security Audit workflow now gets past pnpm (fixed in `d186dee`) but fails on two bugs
in its OWN scripts, found by running it by hand (run 35927984197):
- **npm half:** runs `npm audit` in a pnpm workspace — no package-lock, so it writes an error,
  and `json.load` crashes. Should be `pnpm audit --json` from `frontend/`.
- **Python half:** `v.get('aliases',[''])[0]` → `IndexError` when `aliases` is `[]`.
  Should be `any(a.startswith('CVE') for a in v.get('aliases', []))`.

`pnpm audit` locally (2026-09-24): **3 critical, 98 high, 63 moderate, 4 low.**

**The three options put to Ali:**
1. **Fix the two scripts** — no effect on the app or its speed; the robot just reports
   honestly (it will be RED until 2/3 are done).
2. **Upgrade axios** `^1.7` → `>=1.15.1` (web, mobile, shared). Same 1.x family, same API,
   runs for real users (header injection, NO_PROXY bypass). Web build + both tsc + OTA.
   `form-data` (>=4.0.6) comes with it.
3. **Everything else (~95)** sits in BUILD tools, never on a phone or in the browser:
   expo/@expo/cli (tar, undici, node-forge, ws, xmldom, js-yaml), metro, react-native
   devtools (shell-quote, critical), vite (>=6.4.2), vitest (>=4.1.0, critical — UI server
   only), rollup, workbox. Most need an **Expo SDK upgrade** → may change the runtime version
   → installed phones stop taking OTAs until a new APK/IPA. Do it with a planned new build.
   Web-side items via `@ant-design/pro-layout` (lodash-es, path-to-regexp) need that bumped.

**My recommendation was 1 + 2 now, 3 as its own project.**

### Also still red: Playwright E2E
`work-planner-dragdrop.spec.ts` logs in to `http://localhost:3001` and `playwright.yml`
starts no backend (`ECONNREFUSED ::1:3001`). Needs a backend service in CI, or the spec
skipped in CI. A decision.

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
- Per-job sub-tasks / notes that stick to the job — SHIPPED 2026-09-05 (commit `7266b72`),
  deployed to Render, mobile OTA published to the `preview` channel.
- iPad: swipe now scrolls a day column; hold-then-move drags — 2026-09-08.
- The trade (MECH/ELEC) reaching the board on busy days — 2026-09-09.
- Deleting a manually added job from a PUBLISHED plan — 2026-09-09.

## Known, pre-existing, NOT caused by this work
Four TypeScript errors in the mobile app, all in unrelated screens:
- `src/components/quality/PunchListPanel.tsx:170` — Expected 2 arguments, but got 1
- `src/screens/inspector/InspectionWizardScreen.tsx:170` — `colleagueData` used before declaration
- `src/screens/shared/LeaderboardScreen.tsx:326` — TFunction not assignable
- `src/storage/storage-cleanup.ts:307` — `size` not in `InfoOptions`
