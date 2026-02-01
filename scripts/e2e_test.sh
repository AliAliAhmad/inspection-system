#!/usr/bin/env bash
# ============================================================================
# Frontend E2E Test Runner
# ============================================================================
#
# Runs Playwright E2E tests against the real frontend + backend.
#
# Usage:
#   # Local (frontend on localhost:3000, backend on localhost:5000)
#   ./scripts/e2e_test.sh
#
#   # Against staging
#   FRONTEND_URL=https://your-frontend.onrender.com \
#   TEST_USER_EMAIL=admin@staging.com \
#   TEST_USER_PASSWORD=secret \
#     ./scripts/e2e_test.sh
#
#   # Against production (safe mode)
#   FRONTEND_URL=https://your-frontend.onrender.com \
#   TEST_USER_EMAIL=admin@yourdomain.com \
#   TEST_USER_PASSWORD=secret \
#   RUN_PROD_TESTS=true \
#     ./scripts/e2e_test.sh
#
#   # Run specific test file
#   ./scripts/e2e_test.sh specs/a-auth.spec.ts
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$PROJECT_ROOT/frontend/apps/web"
CONFIG="$PROJECT_ROOT/tests/e2e/playwright.config.ts"

echo "============================================"
echo "  INSPECTION SYSTEM — E2E TESTS"
echo "============================================"
echo ""
echo "Frontend URL: ${FRONTEND_URL:-http://localhost:3000}"
echo "Test user:    ${TEST_USER_EMAIL:-admin@process-test.com}"
if [ "${RUN_PROD_TESTS:-}" = "true" ]; then
    echo "Mode:         PRODUCTION (safe, data-writing tests skipped)"
else
    echo "Mode:         ${FRONTEND_URL:+REMOTE}${FRONTEND_URL:-LOCAL}"
fi
echo ""

cd "$WEB_DIR"

# Pass through any extra arguments (like specific test files)
EXTRA_ARGS="${*:-}"

echo "Running Playwright E2E tests..."
npx playwright test --config="$CONFIG" $EXTRA_ARGS
EXIT_CODE=$?

echo ""
echo "============================================"
if [ $EXIT_CODE -eq 0 ]; then
    echo "  ✓  ALL E2E TESTS PASSED"
else
    echo "  ✗  E2E TESTS FAILED (exit code: $EXIT_CODE)"
    echo ""
    echo "  View report: npx playwright show-report test-results/e2e-report"
fi
echo "============================================"

exit $EXIT_CODE
