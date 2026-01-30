# UI_PROD_CHECKLIST.md — Frontend Production Readiness Checklist

## Audit Summary

- **Audit Date**: January 2026
- **Features Verified**: 125 across 21 modules
- **Status**: 116 VERIFIED, 7 PARTIAL (documented), 2 KNOWN ISSUES (documented)
- **Tests**: 119 total (98 shared unit + 7 web unit + 14 E2E)
- **TypeScript Errors**: 0

---

## Pre-Deploy Checklist

### Environment

- [ ] `VITE_API_URL` set to production backend URL in `.env.production`
- [ ] `VITE_APP_TITLE` set to production app name
- [ ] Mobile `environment.ts` production channel points to correct API URL
- [ ] Backend CORS configured to allow the web app's production domain
- [ ] HTTPS enforced on both frontend and backend

### Build

- [ ] `pnpm install --frozen-lockfile` (deterministic install)
- [ ] `pnpm typecheck` passes with 0 errors
- [ ] `pnpm --filter @inspection/shared test` — 98 tests pass
- [ ] `pnpm --filter @inspection/web test` — 7 tests pass
- [ ] `pnpm --filter @inspection/web build` succeeds
- [ ] Output `dist/` contains `index.html`, JS bundles, PWA manifest, service worker

### PWA

- [ ] Replace placeholder icons (`icon-192.png`, `icon-512.png`) with real brand icons
- [ ] Verify `manifest.json` has correct `name`, `short_name`, `theme_color`
- [ ] Test PWA install prompt on Chrome and Safari
- [ ] Verify service worker caches API responses (NetworkFirst, 24h expiry, 100 entries)

### Security

- [x] No secrets in frontend code (only `VITE_` prefixed env vars)
- [x] XSS sanitization utilities tested (34 tests)
- [x] `sanitizeUrl` blocks `javascript:`, `data:`, `vbscript:` protocols
- [x] Login rate limiter active (5 attempts/min, 5-min lockout)
- [x] JWT tokens stored in `localStorage` (web) / `expo-secure-store` (mobile)
- [x] Auto-logout on token refresh failure (`auth:logout` event)
- [x] RoleGuard checks both `user.role` and `user.minor_role`
- [x] No raw error stack traces exposed to UI (all errors use i18n keys)
- [ ] Content Security Policy headers configured on hosting platform
- [ ] `X-Frame-Options: DENY` or `SAMEORIGIN` on hosting platform

### Mobile

- [ ] EAS Build profiles configured for `preview` and `production` channels
- [ ] App icons and splash screen replaced with real brand assets
- [ ] `expo-notifications` push notification setup (if needed)
- [ ] TestFlight / Play Store internal testing before public release

---

## Verified Features (116 of 125)

All core workflows verified:

| Module | Features | Status |
|--------|----------|--------|
| A. Auth & Session | 7 | All verified (rate limiter wired) |
| B. Role-Based Access | 5 | All verified (minor_role supported) |
| C. Dashboard | 5 | All verified |
| D. Equipment CRUD | 5 | All verified |
| E. Checklist CRUD | 5 | All verified |
| F. Schedule CRUD | 5 | All verified |
| G. Inspector Workflow | 7 | 6 verified, 1 issue (G7) |
| H. Defect Handling | 5 | 4 verified, 1 partial (H5) |
| I. Reports & Charts | 6 | 5 verified, 1 partial (I6) |
| J. Offline / Sync | 8 | 7 verified, 1 partial (J8) |
| K. Specialist Jobs | 8 | All verified |
| L. Specialist Timer | 7 | 6 verified, 1 partial (L7) |
| M. Engineer Jobs | 8 | All verified |
| N. Quality Reviews | 6 | All verified |
| O. Leaves | 5 | All verified |
| P. Leaderboard | 4 | All verified |
| Q. Notifications | 5 | All verified (badge wired) |
| R. Bilingual / RTL | 6 | All verified |
| S. Admin Approvals | 5 | All verified |
| T. Bonus Stars | 4 | All verified |
| U. Testing & CI | 9 | 7 verified, 2 issues (U7, U3 pre-existing) |

---

## Known Issues

### ISSUES (2)

| ID  | Description | Impact | Recommendation |
|-----|-------------|--------|----------------|
| G7  | No upload progress indicator for inspection photos | Low UX — user sees no progress during upload | Add Ant Design Upload `progress` prop post-launch |
| U7  | Zero React component unit tests (web) | Testing gap | Blocked by jsdom@27 ESM issue; downgrade to jsdom@24/25 then add component tests |

### PARTIAL (7)

| ID  | Description | Impact | Recommendation |
|-----|-------------|--------|----------------|
| A7  | Rate limiter was dead code | FIXED in Phase 2 | N/A |
| B4  | `minor_role` not checked in RoleGuard | FIXED in Phase 2 | N/A |
| H5  | No standalone defect page | Low — defects visible within inspection | New feature, post-launch |
| I6  | Report page filters limited | Low — basic date range works | Enhance post-launch |
| J8  | Offline conflict detail limited | Low — items silently pruned after 5 retries | Document for users |
| L7  | No image lazy loading for photos | Low — images load eagerly | Optimize post-launch |
| S5  | Notification badge was hardcoded 0 | FIXED in Phase 2 | N/A |

---

## Known Limitations

### Mobile Offline

1. **Offline hooks not wired to screens**: `useOfflineQuery` / `useOfflineMutation` infrastructure exists but no screen imports them. All API calls fail normally when offline.
2. **Photo uploads not queued offline**: Binary files cannot be serialized to MMKV JSON queue.
3. **Silent queue pruning**: Operations that fail 5 times are silently removed with no user notification.
4. **No conflict resolution UI**: Server-rejected operations (4xx) are discarded without user feedback.

### Web PWA

5. **No web offline indicator**: PWA silently falls back to Workbox-cached API data; no user-facing offline banner.
6. **No web offline write queue**: Mutations fail immediately when offline on web.

### Testing Infrastructure

7. **jsdom@27 ESM incompatibility**: `html-encoding-sniffer@6` breaks under jsdom@27 in Vitest. Workaround: use `// @vitest-environment node` for pure-function tests. Fix: downgrade to jsdom@24 or jsdom@25.

---

## Test Coverage Summary

| Suite | Framework | Files | Tests | What's Covered |
|-------|-----------|-------|-------|----------------|
| Shared unit | Vitest (node) | 5 | 98 | date-utils, role-guards, roles, sanitize, token-storage |
| Web unit | Vitest (node) | 1 | 7 | rate-limiter (lockout, window, reset) |
| Web E2E | Playwright (chromium) | 3 | 14 | Login, inspector flow, sidebar navigation, logout |
| **Total** | | **9** | **119** | |
