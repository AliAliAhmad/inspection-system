# UI_RUN.md — Frontend Developer Guide

## Prerequisites

| Tool    | Version  | Install                                     |
|---------|----------|---------------------------------------------|
| Node.js | >= 18    | https://nodejs.org or `nvm install 18`      |
| pnpm    | >= 8     | `npm install -g pnpm`                       |
| Backend | Running  | See backend `RUN.md` (Flask on port 5000)   |

For mobile development additionally:
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (macOS) or Android Emulator

---

## Monorepo Structure

```
frontend/
  pnpm-workspace.yaml
  package.json                  # Root scripts

  packages/
    shared/                     # @inspection/shared — types, API clients, i18n, utils, hooks
      src/
        api/                    # 21 API modules (auth, users, equipment, inspections, ...)
        types/                  # TypeScript interfaces matching backend models
        hooks/                  # useAuth, useLanguage, useNotifications
        i18n/                   # en.json, ar.json
        utils/                  # date-utils, sanitize, token-storage, role-guards
        constants/              # roles, API endpoints

  apps/
    web/                        # @inspection/web — React + Vite + Ant Design 5
    mobile/                     # @inspection/mobile — React Native (Expo 52)
```

---

## Quick Start

### 1. Install dependencies

```bash
cd frontend
pnpm install
```

### 2. Configure environment

```bash
# Web app
cp apps/web/.env.example apps/web/.env.development
# Edit VITE_API_URL if your backend is not on localhost:5000
```

The mobile app reads environment from `apps/mobile/src/config/environment.ts` based on the EAS channel (`development` | `preview` | `production`).

### 3. Start the web app

```bash
pnpm web:dev
# or
pnpm --filter @inspection/web dev
```

Opens at **http://localhost:3000**. Vite proxies `/api/*` requests to `http://localhost:5000`.

### 4. Start the mobile app

```bash
pnpm mobile:start
# or
pnpm --filter @inspection/mobile start
```

Scan the QR code with Expo Go, or press `i` for iOS Simulator / `a` for Android Emulator.

---

## Environment Variables

### Web (`.env` files, prefixed `VITE_`)

| Variable         | Description                      | Default                              |
|------------------|----------------------------------|--------------------------------------|
| `VITE_API_URL`   | Backend API base URL             | `http://localhost:5000`              |
| `VITE_APP_TITLE` | Browser tab / PWA title          | `Inspection System`                  |

### Mobile (EAS channels in `environment.ts`)

| Channel       | API URL                                     |
|---------------|---------------------------------------------|
| `development` | `http://localhost:5000`                     |
| `preview`     | `https://staging-api.inspection-system.com` |
| `production`  | `https://api.inspection-system.com`         |

---

## Running Tests

### Shared package unit tests (Vitest, 98 tests)

```bash
pnpm --filter @inspection/shared test
# Watch mode:
pnpm --filter @inspection/shared test:watch
```

### Web unit tests (Vitest, 7 tests)

```bash
pnpm --filter @inspection/web test
# Watch mode:
pnpm --filter @inspection/web test:watch
```

### Web E2E tests (Playwright, 14 tests)

Requires the web app to be running on port 5173 (Playwright auto-starts it locally):

```bash
pnpm --filter @inspection/web e2e
# Interactive UI mode:
pnpm --filter @inspection/web e2e:ui
```

In CI, set `CI=true` — Playwright will expect the server to already be running and will use 1 worker with 1 retry.

### TypeScript type checking

```bash
pnpm typecheck
# or per package:
pnpm --filter @inspection/web typecheck
pnpm --filter @inspection/shared typecheck
pnpm --filter @inspection/mobile typecheck
```

---

## Build for Production

### Web

```bash
pnpm --filter @inspection/web build
```

Output: `apps/web/dist/` — static files ready for Nginx, Cloudflare Pages, Vercel, etc.

The build includes:
- PWA manifest + service worker (Workbox)
- Code splitting (32 lazy-loaded pages)
- Tree-shaken Ant Design 5

### Mobile

```bash
# EAS Build (recommended)
cd apps/mobile
eas build --platform ios --profile production
eas build --platform android --profile production

# Local preview build
expo start --no-dev
```

---

## User Roles & Navigation

| Role              | Web Sidebar Items                                                                                  |
|-------------------|----------------------------------------------------------------------------------------------------|
| Admin             | Dashboard, Users, Equipment, Checklists, Schedules, Assignments, Inspections, Specialist Jobs, Engineer Jobs, Quality Reviews, Leave Approvals, Bonus Approvals, Reports |
| Inspector         | Dashboard, My Assignments, Notifications, Leaderboard, Leaves, Profile                            |
| Specialist        | Dashboard, My Jobs, Notifications, Leaderboard, Leaves, Profile                                   |
| Engineer          | Dashboard, My Jobs, Create Job, Team Assignment, Pause Approvals, Notifications, Leaderboard, Leaves, Profile |
| Quality Engineer  | Dashboard, Pending Reviews, Overdue Reviews, Bonus Requests, Notifications, Leaderboard, Leaves, Profile |

Login with any role to see the corresponding sidebar. The `RoleGuard` component checks both `user.role` and `user.minor_role`.

---

## Auth Flow

1. User submits credentials on LoginPage
2. `POST /api/auth/login` returns `{ access_token, refresh_token, user }`
3. Tokens stored in `localStorage` (web) or `expo-secure-store` (mobile)
4. Axios interceptor attaches `Authorization: Bearer <token>` to all requests
5. On 401, the interceptor tries `POST /api/auth/refresh` with the refresh token
6. If refresh fails, a `window.dispatchEvent(new Event('auth:logout'))` fires, clearing tokens and redirecting to login

---

## Bilingual / RTL

- `LanguageProvider` sets `document.dir = 'rtl'` and `ConfigProvider direction="rtl"` for Arabic
- Static strings via `i18next` with `en.json` / `ar.json` in `packages/shared/src/i18n/`
- Language selector on login page and in the user dropdown menu
- `Accept-Language` header sent on all API requests
