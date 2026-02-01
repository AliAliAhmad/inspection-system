# UI Testing Runbook — Inspection System

## 1. Purpose

The **frontend E2E integration tests** validate real user behavior through the actual UI, connecting to the real backend. They cover:

```
Login → Navigate Pages → Load Equipment → Start Inspection
→ Answer Questions → Submit Failing Answers → Verify Defects
→ Check Reports → Validate Data Visibility
```

These tests use **Playwright** to drive a real browser against the deployed (or local) frontend, which communicates with the real Flask backend. No mocks.

---

## 2. Test Structure

```
tests/e2e/
├── playwright.config.ts            # Playwright configuration
├── helpers/
│   ├── env.ts                      # Environment variable config
│   ├── auth.ts                     # Login helpers (UI + API)
│   └── diagnostics.ts              # Connection failure diagnosis
└── specs/
    ├── a-auth.spec.ts              # Authentication (login, session, protection)
    ├── b-backend-connection.spec.ts # API connectivity (CORS, auth headers, shapes)
    ├── c-inspection-workflow.spec.ts # Inspector workflow (assignments, answers, submit)
    ├── d-reports.spec.ts           # Reports page (dashboard, analytics, capacity)
    └── e-defects.spec.ts           # Defects & data visibility (tables, tabs, modals)
```

| File | What It Tests | Writes Data? |
|------|--------------|-------------|
| `a-auth.spec.ts` | Login, session persistence, invalid credentials | No |
| `b-backend-connection.spec.ts` | API health, CORS, auth headers, response shapes | No |
| `c-inspection-workflow.spec.ts` | Equipment list, assignments, answering, submitting | Yes (skipped in prod) |
| `d-reports.spec.ts` | Reports page, dashboard stats, defect analytics | No |
| `e-defects.spec.ts` | Defects table, status tabs, assign modal, all admin pages | Partially (modal test skipped in prod) |

---

## 3. How to Run Tests Locally

### Prerequisites
1. Backend running on `http://localhost:5000`
2. Frontend running on `http://localhost:3000` (or `3000` via `pnpm dev`)
3. Playwright browsers installed

```bash
# Install Playwright browsers (first time only)
cd frontend/apps/web && npx playwright install chromium && cd -

# Start backend (terminal 1)
python run.py

# Start frontend (terminal 2)
cd frontend/apps/web && pnpm dev

# Run E2E tests (terminal 3)
npx playwright test --config=tests/e2e/playwright.config.ts
```

### Quick one-liner (if both servers are already running)
```bash
npx playwright test --config=tests/e2e/playwright.config.ts
```

### Run specific test file
```bash
npx playwright test --config=tests/e2e/playwright.config.ts specs/a-auth.spec.ts
```

### Run in headed mode (see the browser)
```bash
HEADED=true npx playwright test --config=tests/e2e/playwright.config.ts
```

---

## 4. Required Environment Variables

| Variable | Required For | Default | Example |
|----------|-------------|---------|---------|
| `FRONTEND_URL` | Remote tests | `http://localhost:3000` | `https://inspection-web.onrender.com` |
| `TEST_USER_EMAIL` | All tests | `admin@process-test.com` | `admin@yourdomain.com` |
| `TEST_USER_PASSWORD` | All tests | `Admin123!` | `YourPassword` |
| `TEST_INSPECTOR_EMAIL` | Workflow tests | `inspector@process-test.com` | `inspector@yourdomain.com` |
| `TEST_INSPECTOR_PASSWORD` | Workflow tests | `Inspect123!` | `InspectorPass` |
| `TEST_EQUIPMENT_CODE` | Equipment test (optional) | *(none)* | `E2E-PUMP-001` |
| `RUN_PROD_TESTS` | Production only | `false` | `true` |
| `HEADED` | Debug only | `false` | `true` |

Local tests work with **no environment variables** if using default test accounts.

---

## 5. How to Run Against Staging

```bash
FRONTEND_URL=https://your-staging-frontend.onrender.com \
TEST_USER_EMAIL=admin@staging.com \
TEST_USER_PASSWORD=your_password \
TEST_INSPECTOR_EMAIL=inspector@staging.com \
TEST_INSPECTOR_PASSWORD=inspector_password \
  npx playwright test --config=tests/e2e/playwright.config.ts
```

---

## 6. How to Run Against Production (Safe Mode)

```bash
FRONTEND_URL=https://your-production-frontend.onrender.com \
TEST_USER_EMAIL=admin@yourdomain.com \
TEST_USER_PASSWORD=your_password \
RUN_PROD_TESTS=true \
  npx playwright test --config=tests/e2e/playwright.config.ts --grep-invert "skipIfProdUnsafe"
```

**Production safety rules:**
- Tests that create data (`C3`, `C4`, `C5`, `E5`) are automatically skipped
- All other tests are read-only (GET requests + login only)
- `--grep-invert` can be used to exclude specific test patterns
- Failed tests produce screenshots in `test-results/`

---

## 7. Expected Execution Time

| Suite | Environment | Approximate Time |
|-------|------------|-----------------|
| `a-auth.spec.ts` | Local | 15-25 seconds |
| `b-backend-connection.spec.ts` | Local | 10-20 seconds |
| `c-inspection-workflow.spec.ts` | Local | 20-40 seconds |
| `d-reports.spec.ts` | Local | 15-30 seconds |
| `e-defects.spec.ts` | Local | 20-40 seconds |
| **Full suite** | **Local** | **1-3 minutes** |
| **Full suite** | **Remote** | **2-5 minutes** |

---

## 8. How to Read Test Failures

### Test naming convention
Tests are prefixed with section letter + number:
- `A1-A6`: Authentication
- `B1-B7`: Backend connection
- `C1-C6`: Inspection workflow
- `D1-D6`: Reports
- `E1-E9`: Defects & data visibility

### Understanding output
```
PASSED  specs/a-auth.spec.ts:A1: Login page renders correctly
FAILED  specs/b-backend-connection.spec.ts:B1: Health endpoint is reachable
  → Error: expect(received).toBe(expected)
    Expected: 200
    Received: 0 (Network Error)
```

The test ID tells you exactly what failed. See the troubleshooting map below.

### Viewing failure artifacts
```bash
# Open HTML report with screenshots
npx playwright show-report test-results/e2e-report

# Screenshots are in test-results/ directory
ls test-results/
```

---

## 9. UI Test Failure → Likely Cause → Where to Look

### Authentication Tests (A)

| Failing Test | Likely Root Cause | Where to Look |
|---|---|---|
| **A1: Login page renders** | Frontend not serving, wrong URL | `FRONTEND_URL` env var, Vite/Nginx config, Render deploy logs |
| **A2: Login succeeds** | Wrong credentials, JWT config, auth endpoint broken | `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`, `app/services/auth_service.py`, `AuthProvider.tsx` |
| **A2: Login loop** | Token not stored, profile endpoint failing | `token-storage.ts`, `GET /api/auth/me`, `AuthProvider.tsx` useEffect |
| **A2: Blank screen after login** | JS error in MainLayout, router crash | Browser console, `MainLayout.tsx`, `AppRouter.tsx` |
| **A3: Failed login not showing error** | Error not caught, Alert component issue | `LoginPage.tsx` error state, `onFinish` catch block |
| **A4: Protected route accessible** | RoleGuard missing, auth gate not working | `App.tsx` isAuthenticated check, `RoleGuard` in `AppRouter.tsx` |
| **A5: Session lost on reload** | Token cleared, /api/auth/me failing | `AuthProvider.tsx` session restore, token-storage.ts |

### Backend Connection Tests (B)

| Failing Test | Likely Root Cause | Where to Look |
|---|---|---|
| **B1: Health unreachable** | Backend down, wrong API URL, DNS issue | Render dashboard, `FRONTEND_URL` proxy config, `vite.config.ts` proxy |
| **B2: Root endpoint fails** | Backend not deployed | Render deploy logs, `app/__init__.py` root route |
| **B3: Login API invalid structure** | Response format changed | `app/services/auth_service.py`, check `access_token` key in response |
| **B4: Auth header not sent** | Token not stored, interceptor broken | `client.ts` request interceptor, `token-storage.ts` |
| **B5: Unauth request not rejected** | Missing `@jwt_required()` decorator | Backend route decorators |
| **B6: CORS errors** | Missing CORS config, wrong origin | `app/__init__.py` CORS setup, browser console, Render env vars |
| **B6: 500 errors on dashboard** | DB query errors, missing tables | Backend logs, `analytics_service.py`, migration state |
| **B7: Wrong response shape** | API changed, `data` key missing | Backend route return statements, `to_dict()` methods |

### Inspection Workflow Tests (C)

| Failing Test | Likely Root Cause | Where to Look |
|---|---|---|
| **C1: Equipment list empty** | No seeded data, API URL wrong, auth header missing | `app/api/equipment.py`, seed script, frontend API client |
| **C2: Assignments empty** | Inspector has no assignments, wrong user | `InspectionAssignment` table, assignment fixtures |
| **C3: Start fails** | Assignment not found, template_id null | `inspection_service.py:start_inspection()`, `by-assignment` endpoint |
| **C4: Answer fails** | Validation error, wrong answer type | `inspection_service.py:answer_question()`, `_validate_answer_value()` |
| **C5: Fail answer — no feedback** | Critical item needs photo, error not shown | `answer_question()` photo check, `InspectionChecklistPage.tsx` error handling |
| **C6: Inspections list fails** | Auth role check, API error | `app/api/inspections.py:list`, admin role guard |

### Reports Tests (D)

| Failing Test | Likely Root Cause | Where to Look |
|---|---|---|
| **D1: Reports page fails** | Analytics service broken | `app/services/analytics_service.py`, DB joins |
| **D2: No statistics** | Dashboard API returns empty | `reportsApi.getAdminDashboard()`, `admin_dashboard` endpoint |
| **D3: No defect analytics** | No defects in DB, analytics query error | `defect-analytics` endpoint, DB data |
| **D4: No capacity data** | Capacity endpoint broken | `capacity` endpoint in reports API |
| **D5: Error alert shown** | One or more report APIs failing | Check which API call returns error in Network tab |
| **D6: Dashboard empty** | Role mismatch, wrong dashboard endpoint | `DashboardPage.tsx` role check, `reportsApi` |

### Defects & Data Visibility Tests (E)

| Failing Test | Likely Root Cause | Where to Look |
|---|---|---|
| **E1: Defects page fails** | API error, auth issue | `app/api/defects.py:list`, JWT token |
| **E2: Missing columns** | Column names changed, i18n key wrong | `DefectsPage.tsx` columns definition |
| **E3: Tab filtering broken** | Status query param not sent | `DefectsPage.tsx` handleTabChange, API `status` param |
| **E4: No assign button** | All defects closed/resolved, no data | Defect status in DB, button disable condition |
| **E5: Modal doesn't open** | Specialists query fails, modal state bug | `usersApi.list({ role: 'specialist' })`, modal state |
| **E6: Equipment table empty** | No equipment data | Equipment seed data, API response |
| **E7: Checklists page fails** | Checklist API broken | `app/api/checklists.py` |
| **E8: Notifications error** | Notifications endpoint missing | `app/api/notifications.py` |
| **E9: 500 errors across pages** | Backend exception, missing DB tables | Backend logs, migration state, `start.sh` patches |

### Common Cross-Cutting Issues

| Symptom | Cause | Fix |
|---|---|---|
| All tests timeout | Frontend not reachable | Check `FRONTEND_URL`, ensure dev server or build is running |
| All tests show login page | Token not accepted by backend | Check `JWT_SECRET_KEY` matches, token not expired |
| CORS errors everywhere | Missing CORS config for frontend origin | Add frontend URL to `CORS_ORIGINS` in backend config |
| Tests pass locally, fail remote | Different API URL, schema drift | Check `VITE_API_URL` in frontend build, run migrations remotely |
| Blank page after login | JS bundle error | Check browser console, verify frontend build succeeded |
| Elements not found | Ant Design version change, i18n language | Check Ant Design class names, ensure English locale |
| Slow tests / timeouts | Remote server cold start | Increase timeouts, ping server before tests |

---

## 10. Post-Deploy Validation

After deploying frontend + backend:

```bash
FRONTEND_URL=https://your-frontend-url.onrender.com \
TEST_USER_EMAIL=admin@yourdomain.com \
TEST_USER_PASSWORD=your_password \
  npx playwright test --config=tests/e2e/playwright.config.ts \
    specs/a-auth.spec.ts specs/b-backend-connection.spec.ts specs/d-reports.spec.ts
```

This runs auth + connection + reports tests (all read-only) to verify the deployment is healthy.
