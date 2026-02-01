"""
PROCESS TEST: Full Inspection Workflow
========================================
Validates the critical business path end-to-end:

  Login → Start Inspection → Answer Questions (step-by-step)
  → Submit (with failures) → Defects Auto-Created → Admin Review
  → Defect Assigned to Specialist → Defect Resolved → Defect Closed
  → Reports & Visibility

The happy-path test is a SINGLE function that executes every step
sequentially, ensuring data flows correctly through the entire process.
Edge-case tests are separate functions.
"""

import pytest
from tests.process.conftest import login


# ======================================================================
# A) Health Check (standalone, no fixtures needed beyond app)
# ======================================================================

def test_health(client):
    """System health endpoint returns OK."""
    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'healthy'
    assert data['database'] == 'connected'


def test_root_info(client):
    """Root endpoint returns API info."""
    resp = client.get('/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'running'


# ======================================================================
# B) Authentication
# ======================================================================

def test_login_success(client, admin_user):
    """Valid credentials return JWT token."""
    token, _ = login(client, 'admin@process-test.com', 'Admin123!')
    assert token


def test_login_failure(client):
    """Bad credentials are rejected."""
    resp = client.post('/api/auth/login', json={
        'email': 'nobody@test.com',
        'password': 'wrong',
    })
    assert resp.status_code in (401, 404)


def test_unauthenticated_rejected(client):
    """Protected endpoints reject unauthenticated requests."""
    resp = client.get('/api/inspections')
    assert resp.status_code in (401, 422)


# ======================================================================
# C + D + E + F) FULL HAPPY-PATH PROCESS TEST
# ======================================================================

def test_full_inspection_workflow(
    client, admin_user, inspector_user, specialist_user,
    test_equipment, test_template, test_assignment,
):
    """
    Complete inspection process in one sequential flow:

    1. Login (admin + inspector)
    2. Verify test data
    3. Start inspection via assignment
    4. Answer all questions step-by-step (including one critical failure)
    5. Check progress = 100%
    6. Submit → status=submitted, result=fail, defects auto-created
    7. Admin review
    8. Assign defect to specialist
    9. Resolve defect
    10. Close defect
    11. Verify reports & visibility
    """
    # ── Step 1: Login ──────────────────────────────────────────
    _, admin_h = login(client, 'admin@process-test.com', 'Admin123!')
    _, insp_h = login(client, 'inspector@process-test.com', 'Inspect123!')

    # ── Step 2: Verify test data ───────────────────────────────
    resp = client.get(f'/api/equipment/{test_equipment.id}', headers=admin_h)
    assert resp.status_code == 200
    assert resp.get_json()['equipment']['serial_number'] == 'E2E-PUMP-001'

    resp = client.get('/api/checklists', headers=admin_h)
    assert resp.status_code == 200
    templates = resp.get_json()['data']
    tmpl = [t for t in templates if t['id'] == test_template.id]
    assert len(tmpl) == 1
    assert len(tmpl[0]['items']) == 4

    # ── Step 3: Start inspection via assignment ────────────────
    resp = client.get(
        f'/api/inspections/by-assignment/{test_assignment.id}',
        headers=insp_h,
    )
    assert resp.status_code in (200, 201), f'Start failed: {resp.get_json()}'
    inspection = resp.get_json()['data']
    iid = inspection['id']
    assert inspection['status'] == 'draft'
    assert inspection['equipment_id'] == test_equipment.id

    items = inspection.get('checklist_items', [])
    assert len(items) == 4, f'Expected 4 checklist items, got {len(items)}'

    # ── Step 4: Answer questions step-by-step ──────────────────

    # Item 1: pass_fail → PASS
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[0]['id'],
        'answer_value': 'pass',
        'comment': 'No leaks observed',
    })
    assert resp.status_code == 200, f'Answer 1 failed: {resp.get_json()}'

    # Item 2: CRITICAL pass_fail → FAIL (photo required)
    # First without photo — must be rejected
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[1]['id'],
        'answer_value': 'fail',
    })
    assert resp.status_code == 400, 'Critical failure without photo should be rejected'

    # Now with photo — should succeed
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[1]['id'],
        'answer_value': 'fail',
        'photo_path': '/uploads/vibration_fail.jpg',
        'comment': 'Excessive vibration detected',
    })
    assert resp.status_code == 200, f'Answer 2 (with photo) failed: {resp.get_json()}'

    # Item 3: yes_no → YES
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[2]['id'],
        'answer_value': 'yes',
    })
    assert resp.status_code == 200, f'Answer 3 failed: {resp.get_json()}'

    # Item 4: text (optional)
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[3]['id'],
        'answer_value': 'Minor surface corrosion on housing',
    })
    assert resp.status_code == 200, f'Answer 4 failed: {resp.get_json()}'

    # ── Step 5: Check progress = 100% ─────────────────────────
    resp = client.get(f'/api/inspections/{iid}/progress', headers=insp_h)
    assert resp.status_code == 200
    progress = resp.get_json()['progress']
    assert progress['total_items'] == 4
    assert progress['answered_items'] == 4
    assert progress['is_complete'] is True
    assert progress['progress_percentage'] == 100

    # ── Step 6: Submit inspection ──────────────────────────────
    resp = client.post(f'/api/inspections/{iid}/submit', headers=insp_h)
    assert resp.status_code == 200, f'Submit failed: {resp.get_json()}'
    submitted = resp.get_json().get('inspection') or resp.get_json().get('data', {})
    assert submitted['status'] == 'submitted'
    assert submitted['result'] == 'fail'  # because item 2 failed
    assert submitted.get('submitted_at') is not None

    # ── Step 6b: Verify defects auto-created ───────────────────
    resp = client.get('/api/defects', headers=admin_h)
    assert resp.status_code == 200
    defects = resp.get_json()['data']
    linked = [d for d in defects if d.get('inspection_id') == iid]
    assert len(linked) >= 1, f'Expected ≥1 defect for inspection {iid}'

    # Critical item should produce critical severity
    critical_defects = [d for d in linked if d['severity'] == 'critical']
    assert len(critical_defects) >= 1, 'Critical failure should create critical defect'

    defect_id = linked[0]['id']
    assert linked[0]['status'] == 'open'

    # ── Step 7: Admin reviews the inspection ───────────────────
    resp = client.post(f'/api/inspections/{iid}/review', headers=admin_h, json={
        'notes': 'Reviewed — vibration defect confirmed',
    })
    assert resp.status_code == 200, f'Review failed: {resp.get_json()}'
    reviewed = resp.get_json().get('inspection') or resp.get_json().get('data', {})
    assert reviewed['status'] == 'reviewed'

    # ── Step 8: Assign defect to specialist ────────────────────
    resp = client.post(
        f'/api/defects/{defect_id}/assign-specialist',
        headers=admin_h,
        json={
            'specialist_id': specialist_user.id,
            'category': 'major',
            'major_reason': 'Bearing replacement required',
        },
    )
    assert resp.status_code == 201, f'Assign specialist failed: {resp.get_json()}'
    job = resp.get_json()['data']
    assert job['defect_id'] == defect_id
    assert job['status'] == 'assigned'
    assert 'SPE' in job['job_id']

    # ── Step 9: Resolve defect ─────────────────────────────────
    resp = client.post(
        f'/api/defects/{defect_id}/resolve',
        headers=insp_h,
        json={'resolution_notes': 'Bearing replaced, vibration within spec'},
    )
    assert resp.status_code == 200, f'Resolve failed: {resp.get_json()}'
    assert resp.get_json()['defect']['status'] == 'resolved'

    # ── Step 10: Close defect ──────────────────────────────────
    resp = client.post(f'/api/defects/{defect_id}/close', headers=admin_h)
    assert resp.status_code == 200, f'Close failed: {resp.get_json()}'
    assert resp.get_json()['defect']['status'] == 'closed'

    # ── Step 11: Verify reports & visibility ───────────────────

    # Admin dashboard
    resp = client.get('/api/reports/admin-dashboard', headers=admin_h)
    assert resp.status_code == 200
    assert isinstance(resp.get_json()['data'], dict)

    # Defect analytics
    resp = client.get('/api/reports/defect-analytics', headers=admin_h)
    assert resp.status_code == 200

    # Inspection appears in list
    resp = client.get('/api/inspections', headers=admin_h)
    assert resp.status_code == 200
    inspections = resp.get_json()['data']
    match = [i for i in inspections if i['id'] == iid]
    assert len(match) == 1
    assert match[0]['status'] == 'reviewed'
    assert match[0]['result'] == 'fail'

    # Inspection detail includes all 4 answers
    resp = client.get(f'/api/inspections/{iid}', headers=admin_h)
    assert resp.status_code == 200
    detail = resp.get_json()['inspection']
    assert len(detail.get('answers', [])) == 4


# ======================================================================
# EDGE CASE TESTS
# ======================================================================

def test_submit_incomplete_inspection(
    client, inspector_user, test_equipment, test_template, test_assignment,
):
    """Cannot submit if required items are unanswered."""
    _, header = login(client, 'inspector@process-test.com', 'Inspect123!')

    resp = client.get(
        f'/api/inspections/by-assignment/{test_assignment.id}',
        headers=header,
    )
    iid = resp.get_json()['data']['id']
    items = resp.get_json()['data']['checklist_items']

    # Answer only 1 of 3 required items
    client.post(f'/api/inspections/{iid}/answer', headers=header, json={
        'checklist_item_id': items[0]['id'],
        'answer_value': 'pass',
    })

    resp = client.post(f'/api/inspections/{iid}/submit', headers=header)
    assert resp.status_code == 400, 'Submit should fail when required items are unanswered'


def test_invalid_answer_type_rejected(
    client, inspector_user, test_equipment, test_template, test_assignment,
):
    """pass_fail item rejects non-pass/fail values."""
    _, header = login(client, 'inspector@process-test.com', 'Inspect123!')

    resp = client.get(
        f'/api/inspections/by-assignment/{test_assignment.id}',
        headers=header,
    )
    iid = resp.get_json()['data']['id']
    items = resp.get_json()['data']['checklist_items']

    resp = client.post(f'/api/inspections/{iid}/answer', headers=header, json={
        'checklist_item_id': items[0]['id'],
        'answer_value': 'maybe',  # invalid
    })
    assert resp.status_code == 400


def test_cannot_review_draft(
    client, admin_user, inspector_user,
    test_equipment, test_template, test_assignment,
):
    """Admin cannot review a draft inspection."""
    _, insp_h = login(client, 'inspector@process-test.com', 'Inspect123!')
    _, admin_h = login(client, 'admin@process-test.com', 'Admin123!')

    resp = client.get(
        f'/api/inspections/by-assignment/{test_assignment.id}',
        headers=insp_h,
    )
    iid = resp.get_json()['data']['id']

    resp = client.post(f'/api/inspections/{iid}/review', headers=admin_h, json={
        'notes': 'Trying to review draft',
    })
    assert resp.status_code == 400


def test_cannot_close_open_defect(
    client, admin_user, inspector_user,
    test_equipment, test_template, test_assignment,
):
    """Admin cannot close a defect that is still open (not resolved)."""
    _, insp_h = login(client, 'inspector@process-test.com', 'Inspect123!')
    _, admin_h = login(client, 'admin@process-test.com', 'Admin123!')

    # Start + answer all + submit to create defect
    resp = client.get(
        f'/api/inspections/by-assignment/{test_assignment.id}',
        headers=insp_h,
    )
    iid = resp.get_json()['data']['id']
    items = resp.get_json()['data']['checklist_items']

    for item in items:
        if item['answer_type'] == 'pass_fail' and item.get('critical_failure'):
            client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
                'checklist_item_id': item['id'],
                'answer_value': 'fail',
                'photo_path': '/uploads/test.jpg',
            })
        elif item['answer_type'] == 'pass_fail':
            client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
                'checklist_item_id': item['id'],
                'answer_value': 'pass',
            })
        elif item['answer_type'] == 'yes_no':
            client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
                'checklist_item_id': item['id'],
                'answer_value': 'yes',
            })
        else:
            client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
                'checklist_item_id': item['id'],
                'answer_value': 'N/A',
            })

    client.post(f'/api/inspections/{iid}/submit', headers=insp_h)

    # Get defect
    resp = client.get('/api/defects', headers=admin_h)
    defects = resp.get_json()['data']
    linked = [d for d in defects if d.get('inspection_id') == iid]
    assert len(linked) >= 1

    # Try to close without resolving — should fail
    resp = client.post(f'/api/defects/{linked[0]["id"]}/close', headers=admin_h)
    assert resp.status_code == 400, 'Cannot close an open defect directly'
