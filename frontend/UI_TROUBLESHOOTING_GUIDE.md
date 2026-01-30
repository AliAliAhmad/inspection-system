# UI_TROUBLESHOOTING_GUIDE.md — Frontend Troubleshooting

## Common Issues

### 1. "Login failed" or blank page after login

**Symptoms**: Login form submits, shows error or white screen.

**Checks**:
1. Is the backend running? `curl http://localhost:5000/api/auth/login` should return 405 (method not allowed), not connection refused.
2. Is `VITE_API_URL` correct? Check `apps/web/.env.development` — default is `http://localhost:5000`.
3. Check browser DevTools Network tab for the `/api/auth/login` request. If it shows CORS error, configure backend CORS to allow `http://localhost:3000`.
4. Check browser console for errors. A "TypeError: Failed to fetch" means the backend is unreachable.

**Fix**: Ensure backend is running on port 5000 and CORS is configured. The Vite dev server proxies `/api/*` to localhost:5000, so CORS should not be needed in development unless using the production URL directly.

---

### 2. "Too many attempts" on login

**Symptom**: Login form shows rate limit error even with correct credentials.

**Cause**: Client-side rate limiter blocks after 5 failed attempts within 1 minute. Lockout lasts 5 minutes.

**Fix**: Wait 5 minutes, or clear `localStorage` item `login-rate-limit`:
```js
// Browser console:
localStorage.removeItem('login-rate-limit');
```

---

### 3. Blank sidebar / no menu items

**Symptom**: User logs in but sidebar is empty.

**Cause**: The user's `role` field doesn't match any known role (`admin`, `inspector`, `specialist`, `engineer`, `quality_engineer`).

**Check**: Inspect the user object in localStorage or Network tab response. The `role` field must be one of the 5 known roles.

**Fix**: Update the user's role in the backend database.

---

### 4. Arabic text not appearing / RTL layout broken

**Symptom**: Arabic strings show as keys (e.g., `nav.dashboard`) or layout is still LTR.

**Checks**:
1. Ensure `packages/shared/src/i18n/ar.json` exists and is valid JSON.
2. Check that `LanguageProvider` is in the provider stack (`main.tsx`).
3. Verify `document.dir` is `'rtl'` in browser DevTools when Arabic is selected.

**Fix**: If i18n keys are showing, the JSON file may have a syntax error. Validate with `node -e "require('./packages/shared/src/i18n/ar.json')"`.

---

### 5. Notification badge always shows 0

**Symptom**: Bell icon never shows unread count.

**Checks**:
1. Network tab: is `GET /api/notifications?unread_only=true&per_page=1` returning data?
2. Check response format: expects `{ pagination: { total: N } }` in the response.
3. The polling interval is 30 seconds — wait or refresh.

**Fix**: If the API response format differs, check `MainLayout.tsx:103` where `unreadCount` is extracted.

---

### 6. PWA not installing / no offline caching

**Symptom**: No "Install" prompt in Chrome, or app doesn't work offline.

**Checks**:
1. PWA only works on HTTPS in production (or localhost in dev).
2. Check that `icon-192.png` and `icon-512.png` exist in `apps/web/public/`.
3. Open Chrome DevTools > Application > Service Workers — verify the worker is registered.
4. Check Application > Cache Storage > `api-cache` for cached API responses.

**Fix**: Icons are placeholders — replace with real PNGs of the correct sizes. Rebuild and redeploy.

---

### 7. `pnpm install` fails or modules not found

**Symptom**: Import errors for `@inspection/shared` or missing modules.

**Fix**:
```bash
# Clean and reinstall
rm -rf node_modules apps/web/node_modules apps/mobile/node_modules packages/shared/node_modules
pnpm install
```

Ensure `pnpm-workspace.yaml` lists:
```yaml
packages:
  - packages/*
  - apps/*
```

---

### 8. Vitest web tests fail with `ERR_REQUIRE_ESM`

**Symptom**: Running `pnpm --filter @inspection/web test` shows "require() of ES Module" error.

**Cause**: `jsdom@27` + `html-encoding-sniffer@6` has a CJS/ESM incompatibility.

**Workaround**: Use `// @vitest-environment node` comment at the top of test files that don't need DOM, with a localStorage polyfill.

**Fix**: Downgrade jsdom in `apps/web/package.json`:
```bash
cd apps/web
pnpm add -D jsdom@25
```

---

### 9. Playwright E2E tests fail with "Connection refused"

**Symptom**: E2E tests timeout or show network errors.

**Checks**:
1. Locally, Playwright auto-starts the dev server (port 5173). Ensure port 5173 is free.
2. In CI (`CI=true`), Playwright does NOT start the server — you must start it first.
3. The `baseURL` is `http://localhost:5173` in `playwright.config.ts`.

**Fix for CI**:
```bash
# Start dev server in background, then run tests
pnpm --filter @inspection/web dev &
sleep 5
CI=true pnpm --filter @inspection/web e2e
```

---

### 10. Mobile: "Network request failed" on device

**Symptom**: API calls fail on physical device but work in simulator.

**Cause**: `localhost` in `environment.ts` doesn't resolve on a physical device.

**Fix**: Replace `http://localhost:5000` with your machine's LAN IP:
```ts
// apps/mobile/src/config/environment.ts
development: {
  apiUrl: 'http://192.168.x.x:5000',  // your machine's IP
  ...
}
```

Or use an EAS preview build pointing to a staging server.

---

### 11. Mobile: expo-secure-store errors

**Symptom**: "SecureStore is not available" error.

**Cause**: `expo-secure-store` requires a native build — it doesn't work in Expo Go on Android.

**Fix**: Use a development build:
```bash
cd apps/mobile
eas build --platform android --profile development
```

---

### 12. Tokens not clearing on logout

**Symptom**: After logout, refreshing the page restores the session.

**Checks**:
1. Browser DevTools > Application > Local Storage — look for `access_token` and `refresh_token`.
2. Check the Network tab for the `/api/auth/logout` call.

**Fix**: If tokens persist, the logout API call may have failed (which is caught and ignored). Manually clear:
```js
localStorage.removeItem('access_token');
localStorage.removeItem('refresh_token');
```

The `AuthProvider` listens for `auth:logout` events dispatched when token refresh fails, which also clears tokens.

---

## Architecture Reference

### Provider Stack (Web)

```
QueryClientProvider          — React Query (retry: 1, staleTime: 30s)
  BrowserRouter              — React Router v6
    LanguageProvider          — i18next + RTL + Ant ConfigProvider
      AuthProvider            — JWT tokens + user state
        App                   — Shows LoginPage or AppRouter
          MainLayout          — ProLayout sidebar + Outlet
            [Page Component]  — Lazy-loaded route
```

### Provider Stack (Mobile)

```
QueryClientProvider          — React Query
  OfflineProvider            — NetInfo + sync queue
    LanguageProvider          — i18next + I18nManager RTL
      AuthProvider            — expo-secure-store + user state
        RootNavigator         — Stack + Bottom Tabs
          [Screen Component]
```

### Key File Locations

| Concern | File |
|---------|------|
| API client + interceptors | `packages/shared/src/api/client.ts` |
| Auth API | `packages/shared/src/api/auth.api.ts` |
| Token storage (web) | `packages/shared/src/utils/token-storage.ts` |
| Token storage (mobile) | `apps/mobile/src/storage/token-storage.ts` |
| Role guard utility | `packages/shared/src/utils/role-guards.ts` |
| Route definitions | `apps/web/src/router/AppRouter.tsx` |
| Sidebar menus | `apps/web/src/layouts/MainLayout.tsx` |
| i18n English strings | `packages/shared/src/i18n/en.json` |
| i18n Arabic strings | `packages/shared/src/i18n/ar.json` |
| Vite + PWA config | `apps/web/vite.config.ts` |
| Offline sync queue | `apps/mobile/src/utils/sync-manager.ts` |
| Mobile environment | `apps/mobile/src/config/environment.ts` |
| Rate limiter | `apps/web/src/utils/rate-limiter.ts` |
| XSS sanitization | `packages/shared/src/utils/sanitize.ts` |
