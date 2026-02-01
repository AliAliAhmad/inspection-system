# Scenario Troubleshooting Map

When a scenario step fails, use this map to identify the likely cause and where to look.

---

## How to Use This Document

1. Find the failing step number (from `ACCEPTANCE_SCENARIOS.md` or test output)
2. Look up the step in the table below
3. Follow the "Where to Look" column to find the root cause

---

## Golden Path Failures (Backend — `test_golden_path.py`)

| Step | Assertion | Likely Cause | Where to Look |
|------|-----------|-------------|---------------|
| **1** | `JWT token is empty` | Auth endpoint broken, wrong credentials | `app/services/auth_service.py:login()`, password hashing, `JWT_SECRET_KEY` config |
| **1** | `JWT token suspiciously short` | Token generation broken | `flask_jwt_extended` config in `app/config.py` |
| **2** | `Equipment GET returned 4xx` | Equipment not seeded, auth header missing | `tests/process/conftest.py:test_equipment`, `app/api/equipment.py` |
| **2** | `Equipment name/serial mismatch` | Fixture data changed | `conftest.py:test_equipment` fixture values |
| **2** | `Equipment list missing "data" key` | API response format changed | `app/api/equipment.py` list endpoint return statement |
| **3** | `Template not found in list` | Template not seeded, wrong equipment_type match | `conftest.py:test_template`, `app/api/checklists.py` list query |
| **3** | `Template has N items, expected 4` | Items not created, flush/commit issue | `conftest.py:test_template` item creation loop, `db.session.flush()` |
| **3** | `Template item missing "question_text"` | `to_dict()` method changed | `app/models/checklist.py:ChecklistItem.to_dict()` |
| **5** | `Start inspection returned 4xx` | Assignment not found, template_id null, role check | `app/api/inspections.py:get_or_start_by_assignment()`, `inspection_service.py:start_inspection()` |
| **5** | `New inspection should be draft` | Status default changed | `app/models/inspection.py` default status |
| **5** | `Inspection has N items, expected 4` | Template-item linkage broken | `start_inspection()` — copies items from template |
| **6** | `Answer 1 returned 4xx` | Answer validation broken, inspection not draft | `inspection_service.py:answer_question()`, `_validate_answer_value()` |
| **7** | `Critical failure without photo should be rejected` | Photo requirement not enforced | `answer_question()` — look for `critical_failure` + `photo_path` check |
| **7** | `Answer 2 with photo returned 4xx` | Photo path validation too strict | `answer_question()` photo_path handling |
| **8-9** | `Answer N returned 4xx` | Answer type validation | `_validate_answer_value()` for yes_no/text types |
| **10** | `total_items != 4` | Progress calculation broken | `get_inspection_progress()` in inspection_service |
| **10** | `answered_items != 4` | Answer not persisted | DB commit issue, `safe_commit()` in extensions |
| **10** | `is_complete should be True` | Completeness logic wrong | `get_inspection_progress()` is_complete calculation |
| **11** | `Submit returned 4xx` | Completeness validation fails, transaction rollback | `submit_inspection()` → `_validate_completeness()` |
| **11** | `Status should be "submitted"` | Status transition not applied | `submit_inspection()` status assignment |
| **11** | `Result should be "fail"` | Result calculation wrong | `submit_inspection()` → result calculation based on failed answers |
| **12** | `No defects found for inspection` | Auto-defect creation broken | `submit_inspection()` → `_get_failed_answers()` → `DefectService.create_defect_from_failure()` |
| **12** | `New defect should be "open"` | Default defect status changed | `app/models/defect.py` default status |
| **12** | `Critical failure should create critical defect` | Severity mapping broken | `create_defect_from_failure()` severity assignment |
| **13** | `Review returned 4xx` | Status check fails (must be "submitted") | `review_inspection()` — checks `status == 'submitted'` |
| **14** | `Assign specialist returned 4xx` | Specialist not found, duplicate job | `app/api/defects.py:assign_specialist()`, SpecialistJob unique constraint |
| **14** | `Job ID should contain "SPE"` | Job ID generation changed | `assign_specialist()` job_id format |
| **15** | `Resolve returned 4xx` | Wrong user, defect not in_progress | `DefectService.resolve_defect()`, status check |
| **16** | `Close returned 4xx` | Defect not resolved | `DefectService.close_defect()` — only from 'resolved' |
| **17** | `Final status should be "reviewed"` | Status lost after defect operations | Inspection model integrity |
| **17** | `Should have exactly 4 answers` | Answers not included in detail response | `app/api/inspections.py` detail endpoint, `Inspection.to_dict()` |
| **18** | `Admin dashboard failed` | Analytics query broken | `app/services/analytics_service.py`, DB joins |
| **18** | `Inspection not found in list` | List query filtered it out | `app/api/inspections.py:list` query, pagination |

---

## Golden Path Failures (Frontend — `f-golden-path.spec.ts`)

| Test | Assertion | Likely Cause | Where to Look |
|------|-----------|-------------|---------------|
| **GP-01** | Login page not visible | Frontend not serving, wrong URL | `FRONTEND_URL` env var, Vite/Nginx config, deploy logs |
| **GP-01** | Email input not editable | Form disabled, JS error | `LoginPage.tsx`, browser console |
| **GP-01** | Login button missing | i18n key wrong, component render error | `LoginPage.tsx` button text, `auth.login` translation key |
| **GP-02** | Equipment table not visible | Page didn't load, auth redirect | Role guard in `AppRouter.tsx`, admin auth |
| **GP-02** | No table headers | API error, table render failure | `EquipmentPage.tsx` columns definition, API response |
| **GP-03** | No status tabs | Tabs component not rendered | `MyAssignmentsPage.tsx` Tabs component |
| **GP-03** | No action column | Columns definition changed | `MyAssignmentsPage.tsx` columns array |
| **GP-04** | No progress indicator | Progress query failed, loading stuck | `InspectionChecklistPage.tsx` progress query, API response shape |
| **GP-04** | No checklist cards | Items not loaded, empty array | `by-assignment` API response, `checklist_items` array |
| **GP-04** | No answer controls | Answer type not recognized, render switch broken | `InspectionChecklistPage.tsx:renderAnswerInput()` switch cases |
| **GP-04** | No submit button | Inspection status != draft | `InspectionChecklistPage.tsx` draft check |
| **GP-04** | No comment/photo buttons | UI changed, i18n key mismatch | `ChecklistItemCard` comment/photo button text |
| **GP-05** | No critical badge | No critical items in template | `conftest.py` template items, `critical_failure` field |
| **GP-05** | No error on fail without photo | Backend not enforcing, error not displayed | `answer_question()` photo check, `InspectionChecklistPage.tsx` error handling |
| **GP-06** | No status tabs on defects | DefectsPage Tabs not rendered | `DefectsPage.tsx` tabItems array |
| **GP-06** | Missing severity/status columns | Column names changed | `DefectsPage.tsx` columns definition |
| **GP-06** | No assign button and no empty state | API error, table not loading | `defectsApi.list()`, network errors |
| **GP-07** | Loading spinner stuck | Report API hanging or error | `reportsApi` calls, backend report endpoints, timeout |
| **GP-07** | No statistics cards | Dashboard API returns empty/error | `reportsApi.getAdminDashboard()`, `analytics_service.py` |
| **GP-07** | Error alert visible | One or more report APIs failing | Check each report API in network tab |
| **GP-08** | Error on admin page | 500 from backend, missing DB table | Backend logs, migration state |

---

## Contract/Schema Failures (`test_contract_schemas.py`)

| Test | Assertion | Likely Cause | Where to Look |
|------|-----------|-------------|---------------|
| `SCHEMA FAIL: Missing required field "X"` | API response format changed | The endpoint's return statement — find the missing key in the `jsonify()` call |
| `SCHEMA FAIL: Field "X" should be Y, got Z` | Data type changed | The model's `to_dict()` method or the endpoint's response construction |
| `login missing access_token` | Auth response restructured | `auth_service.py:login()` return value |
| `Equipment list missing "data"` | Pagination wrapper removed | `equipment.py` list endpoint `jsonify()` call |
| `Template missing "items"` | Items not included in serialization | `ChecklistTemplate.to_dict()` items inclusion |
| `Progress missing required fields` | Progress response restructured | `get_inspection_progress()` return dict |

---

## Cross-Cutting Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| All backend tests fail with import errors | Missing dependency, venv not activated | `pip install -r requirements.txt`, activate venv |
| All backend tests fail with DB errors | SQLite schema issue | Check `_db.create_all()` in conftest, model imports |
| All frontend tests timeout | Frontend/backend not running | Start both servers, check `FRONTEND_URL` |
| Frontend tests pass locally, fail remote | Different API URL, env vars wrong | Check `VITE_API_URL`, `FRONTEND_URL`, CORS config |
| Contract tests pass but golden path fails | Business logic broken, not response shape | Check service layer (`app/services/`), not API layer |
| Golden path passes but UI test fails | Frontend not consuming response correctly | Check frontend API call → state mapping in page component |
| Intermittent failures | Race conditions, cold starts | Increase timeouts, add `waitForTimeout()`, warm up server |

---

## Quick Diagnosis Commands

```bash
# Run just the golden path (backend)
python -m pytest tests/process/test_golden_path.py -v --tb=short

# Run just the golden path (frontend)
cd frontend/apps/web && npx playwright test --config=../../../tests/e2e/playwright.config.ts specs/f-golden-path.spec.ts

# Run contract checks only
python -m pytest tests/process/test_contract_schemas.py -v --tb=short

# Run everything
python -m pytest tests/process/ -v --tb=short
cd frontend/apps/web && npx playwright test --config=../../../tests/e2e/playwright.config.ts
```
