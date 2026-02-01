# Acceptance Scenarios — Inspection System

## Scenario 1: Full Inspection Workflow (Golden Path)

The complete technician workflow from login to report visibility.

---

### Step 1: Login

- [ ] **UI Elements**: Email input, Password input, Login button, Language selector
- [ ] **API Call**: `POST /api/auth/login` with `{ email, password }`
- [ ] **Expected Result**: Response contains `access_token`, `refresh_token`, `user` object. Token stored in `localStorage`. App redirects to dashboard (ProLayout visible).

### Step 2: Dashboard Loads

- [ ] **UI Elements**: ProLayout sidebar, Dashboard statistics (cards with counts), role-based menu items
- [ ] **API Call**: `GET /api/auth/me` (session restore), `GET /api/reports/dashboard` or `GET /api/reports/admin-dashboard`
- [ ] **Expected Result**: User profile loaded. Dashboard shows statistics: user count, equipment count, inspections today, open defects.

### Step 3: View Equipment List

- [ ] **UI Elements**: Equipment table with columns (Name, Type, Serial Number, Location, Berth, Status), search bar, pagination
- [ ] **API Call**: `GET /api/equipment`
- [ ] **Expected Result**: Response contains `data` array of equipment objects with fields: `id`, `name`, `equipment_type`, `serial_number`, `location`, `berth`, `status`. Table renders with data rows.

### Step 4: View Inspection Assignments (Inspector)

- [ ] **UI Elements**: Assignments table with columns (Equipment Name, Type, Location/Berth, Shift, Status, Deadline, Actions), status filter tabs (All, Assigned, In Progress, Completed)
- [ ] **API Call**: `GET /api/inspection-assignments/my`
- [ ] **Expected Result**: Response contains `data` array and `pagination`. Table shows assignments with "Start" button for `assigned` status.

### Step 5: Start Inspection

- [ ] **UI Elements**: "Start" button in assignment row. After click: navigation to `/inspector/inspection/:id`. Equipment info card, Progress bar (0%), Checklist items list.
- [ ] **API Call**: `GET /api/inspections/by-assignment/:assignmentId`
- [ ] **Expected Result**: Response contains `data` with inspection object: `id`, `status: "draft"`, `equipment_id`, `checklist_items` array. Each item has `id`, `question_text`, `answer_type`, `is_required`, `critical_failure`.

### Step 6: Answer Question — Pass (pass_fail type)

- [ ] **UI Elements**: Checklist item card with question text, "Pass" / "Fail" radio buttons, optional Comment button, optional Photo button. Green checkmark appears after answering.
- [ ] **API Call**: `POST /api/inspections/:id/answer` with `{ checklist_item_id, answer_value: "pass" }`
- [ ] **Expected Result**: Response status 200. Answer saved. Progress bar updates (e.g., 1/4 = 25%).

### Step 7: Answer Question — Fail on Critical Item (pass_fail, critical_failure=true)

- [ ] **UI Elements**: Same as Step 6 but item has a red star badge (critical indicator). Photo upload button visible.
- [ ] **API Call (without photo)**: `POST /api/inspections/:id/answer` with `{ checklist_item_id, answer_value: "fail" }` — **must be rejected (400)** because critical failures require photo.
- [ ] **API Call (with photo)**: `POST /api/inspections/:id/answer` with `{ checklist_item_id, answer_value: "fail", photo_path: "/uploads/...", comment: "..." }`
- [ ] **Expected Result**: Without photo → 400 error. With photo → 200 success. Answer saved with photo_path.

### Step 8: Answer Question — Yes/No Type

- [ ] **UI Elements**: "Yes" / "No" radio buttons.
- [ ] **API Call**: `POST /api/inspections/:id/answer` with `{ checklist_item_id, answer_value: "yes" }`
- [ ] **Expected Result**: Response status 200. Progress updates.

### Step 9: Answer Question — Text Type (Optional)

- [ ] **UI Elements**: Text area input. Optional field (no validation required).
- [ ] **API Call**: `POST /api/inspections/:id/answer` with `{ checklist_item_id, answer_value: "free text here" }`
- [ ] **Expected Result**: Response status 200. Progress reaches 100%.

### Step 10: Verify Progress = 100%

- [ ] **UI Elements**: Progress bar shows 100% (green), "4 / 4" label. Submit button becomes enabled.
- [ ] **API Call**: `GET /api/inspections/:id/progress`
- [ ] **Expected Result**: `{ progress: { total_items: 4, answered_items: 4, is_complete: true, progress_percentage: 100 } }`

### Step 11: Submit Inspection

- [ ] **UI Elements**: Submit button (enabled), Confirmation popover, Loading state during submission.
- [ ] **API Call**: `POST /api/inspections/:id/submit`
- [ ] **Expected Result**: Response contains inspection with `status: "submitted"`, `result: "fail"` (because item 2 failed), `submitted_at` timestamp. Inspector is redirected to assignments list.

### Step 12: Defect Auto-Created

- [ ] **UI Elements**: (Admin view) Defects page shows new defect linked to this inspection.
- [ ] **API Call**: `GET /api/defects`
- [ ] **Expected Result**: At least 1 defect with `inspection_id` matching, `severity: "critical"` (from the critical failed item), `status: "open"`.

### Step 13: Admin Reviews Inspection

- [ ] **UI Elements**: (Admin view) All Inspections page → submitted inspection row → Review action.
- [ ] **API Call**: `POST /api/inspections/:id/review` with `{ notes: "..." }`
- [ ] **Expected Result**: Inspection `status` changes to `"reviewed"`. `reviewed_at` timestamp set.

### Step 14: Assign Defect to Specialist

- [ ] **UI Elements**: Defects page → "Assign Specialist" button → Modal with specialist selector, category dropdown, major reason textarea.
- [ ] **API Call**: `POST /api/defects/:id/assign-specialist` with `{ specialist_id, category, major_reason }`
- [ ] **Expected Result**: SpecialistJob created with `status: "assigned"`, `job_id` containing "SPE". Defect status changes to `"in_progress"`.

### Step 15: Resolve Defect

- [ ] **UI Elements**: (Specialist/Inspector view) Defect resolution action.
- [ ] **API Call**: `POST /api/defects/:id/resolve` with `{ resolution_notes: "..." }`
- [ ] **Expected Result**: Defect `status` changes to `"resolved"`. `resolved_at` timestamp set.

### Step 16: Close Defect

- [ ] **UI Elements**: (Admin view) Defect close action.
- [ ] **API Call**: `POST /api/defects/:id/close`
- [ ] **Expected Result**: Defect `status` changes to `"closed"`.

### Step 17: Verify Reports

- [ ] **UI Elements**: Reports page with statistics cards, defect analytics table (by severity, by status), pause analytics, staff capacity with utilization progress bar.
- [ ] **API Call**: `GET /api/reports/admin-dashboard`, `GET /api/reports/defect-analytics`
- [ ] **Expected Result**: Dashboard data is a dict with counts. Defect analytics contains `total_defects`, `by_severity`, `by_status`.

### Step 18: Verify Inspection in List

- [ ] **UI Elements**: All Inspections page → inspection row with `status: "reviewed"`, `result: "fail"`.
- [ ] **API Call**: `GET /api/inspections`
- [ ] **Expected Result**: Inspection appears in list with correct status and result.

### Step 19: Verify Inspection Detail

- [ ] **UI Elements**: Inspection detail view showing equipment info, all 4 answers, status badge.
- [ ] **API Call**: `GET /api/inspections/:id`
- [ ] **Expected Result**: Response contains `inspection` with `answers` array of length 4, each with `answer_value` and `checklist_item_id`.

---

## Scenario 2: Incomplete Submission Rejected

- [ ] **Precondition**: Inspector starts inspection.
- [ ] **Action**: Answer only 1 of 3 required items, then attempt submit.
- [ ] **API Call**: `POST /api/inspections/:id/submit`
- [ ] **Expected Result**: 400 error. Inspection stays in `"draft"` status.
- [ ] **UI Behavior**: Submit button disabled when progress < 100%.

---

## Scenario 3: Invalid Answer Type Rejected

- [ ] **Precondition**: Inspector starts inspection.
- [ ] **Action**: Submit `answer_value: "maybe"` to a `pass_fail` item.
- [ ] **API Call**: `POST /api/inspections/:id/answer` with `{ answer_value: "maybe" }`
- [ ] **Expected Result**: 400 error. Answer not saved.

---

## Scenario 4: Cannot Review Draft Inspection

- [ ] **Precondition**: Admin attempts to review a draft inspection (not submitted).
- [ ] **API Call**: `POST /api/inspections/:id/review`
- [ ] **Expected Result**: 400 error. Only `"submitted"` inspections can be reviewed.

---

## Scenario 5: Cannot Close Unresolved Defect

- [ ] **Precondition**: Defect is in `"open"` status.
- [ ] **Action**: Admin attempts to close directly (skip resolve step).
- [ ] **API Call**: `POST /api/defects/:id/close`
- [ ] **Expected Result**: 400 error. Defect must be `"resolved"` before closing.

---

## Scenario 6: Authentication Protection

- [ ] **Action**: Access `/api/inspections` without Authorization header.
- [ ] **Expected Result**: 401 or 422 error.
- [ ] **UI Behavior**: Unauthenticated users see only the login page.

---

## Entity Checklist

After the golden path completes, these entities must exist:

| Entity | Required Fields | Status |
|--------|----------------|--------|
| [ ] JWT Token | `access_token` is non-empty string | Verified at login |
| [ ] Equipment | `id`, `name`, `serial_number`, `status: "active"` | Verified at step 3 |
| [ ] Checklist Template | `id`, `name`, `items` array with 4 items | Verified at step 5 |
| [ ] Inspection Run | `id`, `status: "reviewed"`, `result: "fail"`, `submitted_at`, `reviewed_at` | Verified at step 18 |
| [ ] Answers (4) | Each has `checklist_item_id`, `answer_value` | Verified at step 19 |
| [ ] Defect | `inspection_id`, `severity: "critical"`, `status: "closed"` | Verified at step 16 |
| [ ] Specialist Job | `defect_id`, `status: "assigned"`, `job_id` contains "SPE" | Verified at step 14 |
| [ ] Report Data | `admin-dashboard` returns dict, `defect-analytics` returns totals | Verified at step 17 |
