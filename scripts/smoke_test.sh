#!/usr/bin/env bash
# ============================================================================
# Post-Deploy Smoke Test Runner
# ============================================================================
#
# Runs process-based smoke tests against a deployed environment.
# Exits non-zero on any failure — suitable for CI/CD pipelines.
#
# Usage:
#   # Against staging
#   BASE_URL=https://staging-api.example.com \
#   TEST_USER_EMAIL=admin@test.com \
#   TEST_USER_PASSWORD=secret \
#     ./scripts/smoke_test.sh
#
#   # Against production (safe, read-only)
#   BASE_URL=https://api.example.com \
#   TEST_USER_EMAIL=admin@test.com \
#   TEST_USER_PASSWORD=secret \
#   RUN_PROD_TESTS=true \
#     ./scripts/smoke_test.sh
#
#   # Local (full process tests with Flask test client)
#   ./scripts/smoke_test.sh local
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "============================================"
echo "  INSPECTION SYSTEM — SMOKE TESTS"
echo "============================================"
echo ""

MODE="${1:-remote}"

if [ "$MODE" = "local" ]; then
    echo "Mode: LOCAL (Flask test client, in-memory SQLite)"
    echo ""
    echo "Running full process tests..."
    python -m pytest tests/process/test_inspection_process.py \
        tests/process/test_file_upload_process.py \
        -v --tb=short -x \
        --no-header \
        -q
    EXIT_CODE=$?
else
    # Remote mode
    if [ -z "${BASE_URL:-}" ]; then
        echo "ERROR: BASE_URL environment variable is required."
        echo ""
        echo "Example:"
        echo "  BASE_URL=https://your-api.onrender.com \\"
        echo "  TEST_USER_EMAIL=admin@test.com \\"
        echo "  TEST_USER_PASSWORD=secret \\"
        echo "    ./scripts/smoke_test.sh"
        exit 1
    fi

    echo "Mode: REMOTE"
    echo "Target: $BASE_URL"
    echo "User:   ${TEST_USER_EMAIL:-<not set>}"
    if [ "${RUN_PROD_TESTS:-}" = "true" ]; then
        echo "⚠  PRODUCTION MODE — read-only tests only"
    fi
    echo ""

    echo "Running remote smoke tests..."
    python -m pytest tests/process/test_smoke_remote.py \
        -v --tb=short -x \
        --no-header \
        -q
    EXIT_CODE=$?
fi

echo ""
echo "============================================"
if [ $EXIT_CODE -eq 0 ]; then
    echo "  ✓  ALL SMOKE TESTS PASSED"
else
    echo "  ✗  SMOKE TESTS FAILED (exit code: $EXIT_CODE)"
fi
echo "============================================"

exit $EXIT_CODE
