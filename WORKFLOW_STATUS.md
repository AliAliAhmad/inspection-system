# GitHub Actions Workflow Status

## Overview

| Workflow | File | Trigger | Status |
|---------|------|---------|--------|
| Backend Test & Deploy Guard | `.github/workflows/deploy-backend.yml` | Push/PR to main (app/ changes) | ✅ Ready |
| Web Frontend Quality & Deploy | `.github/workflows/deploy-web.yml` | Push/PR to main (frontend/web/ changes) | ✅ Ready |
| Playwright E2E Tests | `.github/workflows/playwright.yml` | Push to main/develop, PR to main | ✅ Ready |
| Nightly Health Check | `.github/workflows/nightly.yml` | Daily 2am UTC + manual | ✅ Ready |
| Security Audit | `.github/workflows/security.yml` | Weekly Monday + PR to main | ✅ Ready |
| CI (Frontend) | `frontend/.github/workflows/ci.yml` | Push/PR to main | ✅ Ready (existing) |

---

## Required GitHub Secrets

Configure these in: **GitHub → Settings → Secrets and variables → Actions**

| Secret Name | Used In | How to Get |
|-------------|---------|------------|
| *(none required yet)* | — | Render auto-deploys from main |

### Optional (for notifications):
| Secret Name | Used In | How to Get |
|-------------|---------|------------|
| `SLACK_WEBHOOK_URL` | nightly.yml | Slack App → Incoming Webhooks |
| `RENDER_API_KEY` | If manual deploy needed | Render dashboard → Account Settings → API Keys |

---

## Workflow Details

### `deploy-backend.yml`
**Triggers when:** Changes to `app/`, `migrations/`, `tests/`, `requirements.txt`  
**What it does:**
1. Runs full pytest suite (137 tests, excluding remote-only smoke tests)
2. On push to main: waits 90s for Render auto-deploy, then checks health endpoint

**Note:** Render auto-deploys from main — this workflow only validates quality before deploy.

### `deploy-web.yml`
**Triggers when:** Changes to `frontend/apps/web/` or `frontend/packages/shared/`  
**What it does:**
1. TypeScript check on shared package
2. TypeScript check on web app
3. Runs vitest unit tests on shared
4. Builds web app
5. On push to main: waits 120s then checks web production URL

### `playwright.yml` (enhanced)
**Triggers:** Push to main/develop, PRs to main  
**What it does:**
- Runs all 18 Playwright specs (125+ tests) against localhost
- `--retries=2` handles Render cold-start flakiness
- Uploads HTML report + JSON results on every run
- Uploads test-results/ on failure

### `nightly.yml`
**Triggers:** 2am UTC daily + manual dispatch  
**What it does:**
1. Health check API (`/health`)
2. Health check web frontend
3. Check API endpoints return non-000 status
4. Run smoke E2E tests (auth + navigation) against production

### `security.yml`
**Triggers:** Every Monday 8am UTC + PRs to main + manual  
**What it does:**
1. `npm audit --audit-level=high` on web and mobile
2. `pip-audit` on Python requirements
3. Secret scanning for private keys and hardcoded credentials

---

## Dry Run Results (local verification)

All commands verified to work locally:

```bash
# Backend tests
python3 -m pytest tests/ --ignore=tests/process/test_smoke_remote.py -q  → 137 passed

# Web typecheck
cd frontend && pnpm --filter @inspection/web exec tsc --noEmit            → 0 errors

# Mobile typecheck  
cd frontend/apps/mobile && npx tsc --noEmit                               → 0 errors

# Web build
cd frontend && pnpm --filter @inspection/web build                        → success

# Playwright (baseline)
cd frontend/apps/web && npx playwright test --project="Desktop Chrome"    → 125 passed, 1 flaky

# Production health
curl https://inspection-api-o3hz.onrender.com/health                     → {"status":"healthy"}
```

---

## Current Workflow Counts

- 5 workflows in `.github/workflows/`
- 1 workflow in `frontend/.github/workflows/`
- Total: **6 GitHub Actions workflows**

Last updated: 2026-02-25
