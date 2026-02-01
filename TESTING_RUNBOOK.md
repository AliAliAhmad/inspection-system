# Testing Runbook — Inspection System

## 1. Purpose

The **process-based tests** validate the real business workflow end-to-end:

```
Login → Start Inspection → Answer Questions (step-by-step)
→ Submit with Failures → Defects Auto-Created → Admin Review
→ Defect Assigned to Specialist → Defect Resolved → Defect Closed
→ Reports Show Correct Data
```

These are NOT unit tests. They simulate actual user behavior through the API layer,
catching integration bugs that unit tests miss: broken service calls, missing DB
commits, incorrect status transitions, and broken report queries.

---

## 2. Test Structure

```
tests/process/
├── __init__.py
├── conftest.py                      # Shared fixtures (users, equipment, template)
├── test_inspection_process.py       # Full workflow + edge cases (Flask client)
├── test_file_upload_process.py      # Attachment upload/download/delete
└── test_smoke_remote.py             # HTTP smoke tests for deployed environments
```

| File | Target | Writes Data? |
|------|--------|--------------|
| `test_inspection_process.py` | Local (in-memory SQLite) | Yes (isolated per test) |
| `test_file_upload_process.py` | Local (in-memory SQLite) | Yes (isolated per test) |
| `test_smoke_remote.py` | Staging / Production | Read-only |

---

## 3. How to Run Tests Locally

```bash
# Install dependencies (if not already)
pip install -r requirements.txt

# Run process tests with Flask test client (in-memory DB)
python -m pytest tests/process/test_inspection_process.py -v

# Run all process tests
python -m pytest tests/process/ -v

# Run with coverage
python -m pytest tests/process/ -v --cov=app --cov-report=term-missing

# Quick: use the smoke script
./scripts/smoke_test.sh local
```

No external database needed — tests use in-memory SQLite.

---

## 4. How to Run Against Staging

```bash
BASE_URL=https://your-staging-api.onrender.com \
TEST_USER_EMAIL=admin@staging.com \
TEST_USER_PASSWORD=your_password \
  python -m pytest tests/process/test_smoke_remote.py -v

# Or use the script:
BASE_URL=https://your-staging-api.onrender.com \
TEST_USER_EMAIL=admin@staging.com \
TEST_USER_PASSWORD=your_password \
  ./scripts/smoke_test.sh
```

---

## 5. How to Run Against Production (Safe Mode)

```bash
BASE_URL=https://inspection-api-o3hz.onrender.com \
TEST_USER_EMAIL=admin@yourdomain.com \
TEST_USER_PASSWORD=your_password \
RUN_PROD_TESTS=true \
  python -m pytest tests/process/test_smoke_remote.py -v --tb=short -x
```

**Production safety rules:**
- Remote smoke tests are **read-only** (GET requests + login only)
- No equipment, inspections, or defects are created
- `--tb=short -x` stops on first failure to minimize noise
- No data is deleted

---

## 6. Required Environment Variables

| Variable | Required For | Default | Example |
|----------|-------------|---------|---------|
| `BASE_URL` | Remote tests | *(none)* | `https://inspection-api-o3hz.onrender.com` |
| `TEST_USER_EMAIL` | Remote tests | *(none)* | `admin@test.com` |
| `TEST_USER_PASSWORD` | Remote tests | *(none)* | `Admin123!` |
| `RUN_PROD_TESTS` | Production only | `false` | `true` |
| `TEST_EQUIPMENT_CODE` | Remote (optional) | *(none)* | `E2E-PUMP-001` |
| `TEST_TEMPLATE_NAME` | Remote (optional) | *(none)* | `E2E Process Template` |

Local tests require **no** environment variables.

---

## 7. Expected Execution Time

| Suite | Environment | Approximate Time |
|-------|-------------|------------------|
| `test_inspection_process.py` | Local | 3-8 seconds |
| `test_file_upload_process.py` | Local | 1-3 seconds |
| `test_smoke_remote.py` | Staging | 5-15 seconds |
| `test_smoke_remote.py` | Production | 5-15 seconds |
| Full `tests/process/` | Local | 5-12 seconds |

---

## 8. How to Interpret Failures

### PASS output
```
tests/process/test_inspection_process.py::TestFullInspectionProcess::test_01_health PASSED
tests/process/test_inspection_process.py::TestFullInspectionProcess::test_02_admin_login PASSED
...
22 passed in 5.23s
```

### FAIL output
```
FAILED tests/process/test_inspection_process.py::TestFullInspectionProcess::test_13_submit_inspection
  - AssertionError: assert 400 == 200
```

The test name tells you exactly which **step** of the workflow broke.
The step number maps to the business process:

| Test # | Process Step |
|--------|-------------|
| 01 | Health check |
| 02-04 | Authentication |
| 05-06 | Test data verification |
| 07 | Start inspection |
| 08-11 | Answer questions (step-by-step) |
| 12 | Progress check |
| 13 | Submit inspection |
| 14 | Defect auto-creation |
| 15 | Admin review |
| 16 | Specialist assignment |
| 17-18 | Defect resolve + close |
| 19-22 | Reports & visibility |

---

## 9. Troubleshooting Map

### TEST FAILURE → LIKELY ROOT CAUSE → WHERE TO LOOK

| Failing Test | Likely Root Cause | Where to Look |
|---|---|---|
| **test_01_health** | App not starting, DB unreachable | `app/__init__.py` (health endpoint), `app/config.py` (DATABASE_URL), Render dashboard |
| **test_02/03_login** | JWT_SECRET_KEY missing, auth route broken, user not seeded | `app/services/auth_service.py`, `app/config.py` (JWT config), user seed data |
| **test_04_login_failure** | Auth not rejecting bad credentials | `app/services/auth_service.py:login()` |
| **test_05_equipment_visible** | Equipment not found, DB schema mismatch | `app/models/equipment.py`, migration state, `start.sh` schema patches |
| **test_06_template_visible** | Template or items missing | `app/models/checklist.py`, `app/api/checklists.py` |
| **test_07_start_inspection** | Assignment not found, template_id null, role check fails | `app/api/inspections.py:get_or_start_by_assignment()`, `app/services/inspection_service.py:start_inspection()`, InspectionAssignment table |
| **test_08_answer_passing** | Answer validation broken, inspection not draft | `app/services/inspection_service.py:answer_question()`, `_validate_answer_value()` |
| **test_09_critical_failure** | Photo requirement not enforced, or false positive | `answer_question()` — look for `critical_failure` + `photo_path` check |
| **test_10/11_answers** | Answer type validation | `_validate_answer_value()` in inspection_service |
| **test_12_progress** | Progress calculation wrong | `get_inspection_progress()` in inspection_service |
| **test_13_submit** | Completeness validation fails, or transaction rollback | `submit_inspection()` → `_validate_completeness()`, DB commit/rollback |
| **test_14_defect_auto_created** | Defect not created on submit, or wrong severity | `submit_inspection()` → `_get_failed_answers()` → `DefectService.create_defect_from_failure()` |
| **test_15_admin_review** | Status transition blocked | `review_inspection()` — checks `status == 'submitted'` |
| **test_16_assign_specialist** | Specialist job creation broken | `app/api/defects.py:assign_specialist()`, SpecialistJob model constraints |
| **test_17_resolve_defect** | Resolution not working, wrong user | `DefectService.resolve_defect()`, `assigned_to_id` check |
| **test_18_close_defect** | Close requires resolved status | `DefectService.close_defect()` — only from 'resolved' |
| **test_19-20_reports** | Analytics queries broken, empty data | `app/services/analytics_service.py`, DB joins |
| **test_21-22_visibility** | Inspection not in list, missing answers | `app/api/inspections.py:list/get`, `Inspection.to_dict()` |

### Remote Smoke Test Failures

| Failing Test | Likely Root Cause | Where to Look |
|---|---|---|
| **test_root_endpoint** | App not deployed, wrong URL | Render deploy logs, `BASE_URL` env var |
| **test_health_endpoint** | Database connection failed | Render → PostgreSQL service status, `DATABASE_URL` |
| **test_login_success** | Wrong credentials, user not in prod DB | `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` env vars, user table |
| **test_*_list endpoints** | 401/422 errors | JWT token expired or malformed, check `JWT_SECRET_KEY` matches |
| **test_*_has_pagination** | Response structure changed | `app/utils/pagination.py`, API response format |

### Common Cross-Cutting Issues

| Symptom | Cause | Fix |
|---|---|---|
| All tests 500 | Unhandled exception in error handler | Check `app/__init__.py` error handlers, Flask logs |
| All tests 401 | JWT config broken | Verify `JWT_SECRET_KEY` in config, check token expiry |
| Tests pass locally, fail remote | Schema drift | Run migrations on remote, check `start.sh` patches |
| Defects not created | Transaction rollback | Check `safe_commit()` in `app/extensions.py`, look for DB errors in logs |
| Reports empty | Timezone mismatch | Server uses UTC, check date filters in analytics queries |
| File upload fails | Storage not configured | Check `UPLOAD_FOLDER` config, directory permissions |

---

## 10. Post-Deploy Validation

After every deploy to Render (or any platform), run:

```bash
BASE_URL=https://inspection-api-o3hz.onrender.com \
TEST_USER_EMAIL=admin@yourdomain.com \
TEST_USER_PASSWORD=your_password \
  ./scripts/smoke_test.sh
```

The script:
- Exits `0` on success, non-zero on failure
- Prints clear PASSED/FAILED summary
- Stops on first failure (`-x` flag)
- Can be wired into CI/CD as a post-deploy step
