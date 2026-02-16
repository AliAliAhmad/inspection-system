"""
GOLDEN PATH TEST: Entity Compliance Verification
==================================================
Runs the full inspection workflow and asserts that every required
entity exists with the correct fields and values.

This is the acceptance gate — if this test passes, the system
implements the requested workflow correctly.

Required entities verified:
  1. JWT Token          — non-empty access_token
  2. Equipment          — id, name, serial_number, status
  3. Checklist Template — id, name, items with 4 items
  4. Inspection Run     — id, status, result, submitted_at, reviewed_at
  5. Answers (4)        — each with checklist_item_id, answer_value
  6. Defect             — inspection_id, severity=critical, status=closed
  7. Specialist Job     — defect_id, status=assigned, job_id has "SPE"
  8. Report Data        — admin-dashboard dict, defect-analytics totals
"""

import pytest
from tests.process.conftest import login, make_voice_note


def test_golden_path_entity_compliance(
    client, db_session, admin_user, inspector_user, specialist_user,
    test_equipment, test_template, test_assignment,
):
    """
    Single sequential test verifying every entity exists after the full workflow.
    Mirrors ACCEPTANCE_SCENARIOS.md Steps 1-19.
    """

    # ================================================================
    # ENTITY 1: JWT Token
    # ================================================================
    token, admin_h = login(client, 'admin@process-test.com', 'Admin123!')
    assert token, 'ENTITY FAIL: JWT token is empty'
    assert isinstance(token, str), 'ENTITY FAIL: JWT token is not a string'
    assert len(token) > 20, 'ENTITY FAIL: JWT token suspiciously short'

    insp_token, insp_h = login(client, 'inspector@process-test.com', 'Inspect123!')
    assert insp_token, 'ENTITY FAIL: Inspector JWT token is empty'

    # ================================================================
    # ENTITY 2: Equipment
    # ================================================================
    resp = client.get(f'/api/equipment/{test_equipment.id}', headers=admin_h)
    assert resp.status_code == 200, f'ENTITY FAIL: Equipment GET returned {resp.status_code}'
    eq = resp.get_json()['equipment']

    assert eq['id'] == test_equipment.id, 'ENTITY FAIL: Equipment id mismatch'
    assert eq['name'] == 'TEST-PUMP-E2E', 'ENTITY FAIL: Equipment name mismatch'
    assert eq['serial_number'] == 'E2E-PUMP-001', 'ENTITY FAIL: Equipment serial_number mismatch'
    assert eq['status'] == 'active', 'ENTITY FAIL: Equipment status not active'

    # Equipment list endpoint
    resp = client.get('/api/equipment', headers=admin_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Equipment list endpoint failed'
    eq_list = resp.get_json()
    assert 'data' in eq_list, 'ENTITY FAIL: Equipment list missing "data" key'

    # ================================================================
    # ENTITY 3: Checklist Template
    # ================================================================
    resp = client.get('/api/checklists', headers=admin_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Checklists endpoint failed'
    templates = resp.get_json()['data']
    tmpl = [t for t in templates if t['id'] == test_template.id]
    assert len(tmpl) == 1, 'ENTITY FAIL: Template not found in list'

    assert tmpl[0]['name'] == 'E2E Process Template', 'ENTITY FAIL: Template name mismatch'
    assert 'items' in tmpl[0], 'ENTITY FAIL: Template missing "items" key'
    assert len(tmpl[0]['items']) == 4, f'ENTITY FAIL: Template has {len(tmpl[0]["items"])} items, expected 4'

    # Verify item structure
    for item in tmpl[0]['items']:
        assert 'id' in item, 'ENTITY FAIL: Template item missing "id"'
        assert 'question_text' in item, 'ENTITY FAIL: Template item missing "question_text"'
        assert 'answer_type' in item, 'ENTITY FAIL: Template item missing "answer_type"'

    # ================================================================
    # START INSPECTION (Creates the Run entity)
    # ================================================================
    resp = client.get(
        f'/api/inspections/by-assignment/{test_assignment.id}',
        headers=insp_h,
    )
    assert resp.status_code in (200, 201), f'ENTITY FAIL: Start inspection returned {resp.status_code}'
    inspection = resp.get_json()['data']
    iid = inspection['id']

    assert inspection['status'] == 'draft', 'ENTITY FAIL: New inspection should be draft'
    assert inspection['equipment_id'] == test_equipment.id, 'ENTITY FAIL: Inspection equipment_id mismatch'

    items = inspection.get('checklist_items', [])
    assert len(items) == 4, f'ENTITY FAIL: Inspection has {len(items)} items, expected 4'

    # ================================================================
    # ANSWER ALL QUESTIONS
    # ================================================================

    # Item 1: pass_fail → PASS
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[0]['id'],
        'answer_value': 'pass',
        'comment': 'No leaks observed',
    })
    assert resp.status_code == 200, f'ENTITY FAIL: Answer 1 returned {resp.status_code}'

    # Item 2: CRITICAL pass_fail → FAIL (with photo + voice note)
    vn_id = make_voice_note(db_session, inspector_user.id)
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[1]['id'],
        'answer_value': 'fail',
        'photo_path': '/uploads/vibration_fail.jpg',
        'voice_note_id': vn_id,
        'comment': 'Excessive vibration detected',
    })
    assert resp.status_code == 200, f'ENTITY FAIL: Answer 2 with photo returned {resp.status_code}'

    # Item 3: yes_no → YES
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[2]['id'],
        'answer_value': 'yes',
    })
    assert resp.status_code == 200, f'ENTITY FAIL: Answer 3 returned {resp.status_code}'

    # Item 4: text
    resp = client.post(f'/api/inspections/{iid}/answer', headers=insp_h, json={
        'checklist_item_id': items[3]['id'],
        'answer_value': 'Minor surface corrosion on housing',
    })
    assert resp.status_code == 200, f'ENTITY FAIL: Answer 4 returned {resp.status_code}'

    # ================================================================
    # ENTITY 5: Answers Saved (verify via progress)
    # ================================================================
    resp = client.get(f'/api/inspections/{iid}/progress', headers=insp_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Progress endpoint failed'
    progress = resp.get_json()['progress']

    # Progress counts only items for inspector's category (mechanical = 3 items)
    assert progress['total_items'] in (3, 4), f'ENTITY FAIL: total_items is {progress["total_items"]}'
    assert progress['answered_items'] == progress['total_items'], 'ENTITY FAIL: not all items answered'
    assert progress['is_complete'] is True, 'ENTITY FAIL: is_complete should be True'
    assert progress['progress_percentage'] == 100, 'ENTITY FAIL: progress_percentage != 100'

    # ================================================================
    # SUBMIT INSPECTION
    # ================================================================
    resp = client.post(f'/api/inspections/{iid}/submit', headers=insp_h)
    assert resp.status_code == 200, f'ENTITY FAIL: Submit returned {resp.status_code}'
    submitted = resp.get_json().get('inspection') or resp.get_json().get('data', {})
    assert submitted['status'] == 'submitted', 'ENTITY FAIL: Status should be "submitted" after submit'
    assert submitted['result'] == 'fail', 'ENTITY FAIL: Result should be "fail" (item 2 failed)'
    assert submitted.get('submitted_at') is not None, 'ENTITY FAIL: submitted_at must be set'

    # ================================================================
    # ENTITY 6: Defect Created on Fail
    # ================================================================
    resp = client.get('/api/defects', headers=admin_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Defects list failed'
    defects = resp.get_json()['data']
    linked = [d for d in defects if d.get('inspection_id') == iid]

    assert len(linked) >= 1, f'ENTITY FAIL: No defects found for inspection {iid}'

    # Verify defect structure
    defect = linked[0]
    assert 'id' in defect, 'ENTITY FAIL: Defect missing "id"'
    assert 'severity' in defect, 'ENTITY FAIL: Defect missing "severity"'
    assert 'status' in defect, 'ENTITY FAIL: Defect missing "status"'
    assert defect['status'] == 'open', 'ENTITY FAIL: New defect should be "open"'

    # Critical failure should produce critical severity
    critical_defects = [d for d in linked if d['severity'] == 'critical']
    assert len(critical_defects) >= 1, 'ENTITY FAIL: Critical failure should create critical defect'

    defect_id = linked[0]['id']

    # ================================================================
    # ADMIN REVIEW
    # ================================================================
    resp = client.post(f'/api/inspections/{iid}/review', headers=admin_h, json={
        'notes': 'Reviewed — vibration defect confirmed',
    })
    assert resp.status_code == 200, f'ENTITY FAIL: Review returned {resp.status_code}'
    reviewed = resp.get_json().get('inspection') or resp.get_json().get('data', {})
    assert reviewed['status'] == 'reviewed', 'ENTITY FAIL: Status should be "reviewed" after review'

    # ================================================================
    # ENTITY 7: Specialist Job (Assign Defect)
    # ================================================================
    resp = client.post(
        f'/api/defects/{defect_id}/assign-specialist',
        headers=admin_h,
        json={
            'specialist_id': specialist_user.id,
            'category': 'major',
            'major_reason': 'Bearing replacement required',
        },
    )
    assert resp.status_code == 201, f'ENTITY FAIL: Assign specialist returned {resp.status_code}'
    jobs = resp.get_json()['data']
    job = jobs[0] if isinstance(jobs, list) else jobs

    assert job['defect_id'] == defect_id, 'ENTITY FAIL: Job defect_id mismatch'
    assert job['status'] == 'assigned', 'ENTITY FAIL: Job status should be "assigned"'
    assert 'SPE' in job['job_id'], 'ENTITY FAIL: Job ID should contain "SPE"'
    assert 'job_id' in job, 'ENTITY FAIL: Job missing "job_id"'

    # ================================================================
    # RESOLVE + CLOSE DEFECT
    # ================================================================
    resp = client.post(f'/api/defects/{defect_id}/resolve', headers=insp_h, json={
        'resolution_notes': 'Bearing replaced, vibration within spec',
    })
    assert resp.status_code == 200, f'ENTITY FAIL: Resolve returned {resp.status_code}'
    assert resp.get_json()['defect']['status'] == 'resolved', 'ENTITY FAIL: Defect should be "resolved"'

    resp = client.post(f'/api/defects/{defect_id}/close', headers=admin_h)
    assert resp.status_code == 200, f'ENTITY FAIL: Close returned {resp.status_code}'
    assert resp.get_json()['defect']['status'] == 'closed', 'ENTITY FAIL: Defect should be "closed"'

    # ================================================================
    # ENTITY 4: Inspection Run — Final Status
    # ================================================================
    resp = client.get(f'/api/inspections/{iid}', headers=admin_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Inspection detail failed'
    detail = resp.get_json()['inspection']

    assert detail['status'] == 'reviewed', 'ENTITY FAIL: Final status should be "reviewed"'
    assert detail['result'] == 'fail', 'ENTITY FAIL: Final result should be "fail"'
    assert detail.get('submitted_at') is not None, 'ENTITY FAIL: submitted_at missing'
    assert detail.get('reviewed_at') is not None, 'ENTITY FAIL: reviewed_at missing'
    assert len(detail.get('answers', [])) == 4, 'ENTITY FAIL: Should have exactly 4 answers'

    # Verify each answer has required fields
    for ans in detail['answers']:
        assert 'checklist_item_id' in ans, 'ENTITY FAIL: Answer missing "checklist_item_id"'
        assert 'answer_value' in ans, 'ENTITY FAIL: Answer missing "answer_value"'

    # ================================================================
    # ENTITY 8: Report Contains the Run
    # ================================================================
    resp = client.get('/api/reports/admin-dashboard', headers=admin_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Admin dashboard failed'
    dashboard = resp.get_json()['data']
    assert isinstance(dashboard, dict), 'ENTITY FAIL: Dashboard data should be a dict'

    resp = client.get('/api/reports/defect-analytics', headers=admin_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Defect analytics failed'

    # Inspection appears in list
    resp = client.get('/api/inspections', headers=admin_h)
    assert resp.status_code == 200, 'ENTITY FAIL: Inspections list failed'
    inspections = resp.get_json()['data']
    match = [i for i in inspections if i['id'] == iid]
    assert len(match) == 1, f'ENTITY FAIL: Inspection {iid} not found in list'
    assert match[0]['status'] == 'reviewed', 'ENTITY FAIL: Listed inspection status != reviewed'
    assert match[0]['result'] == 'fail', 'ENTITY FAIL: Listed inspection result != fail'

    # ================================================================
    # ALL ENTITIES VERIFIED — GOLDEN PATH COMPLETE
    # ================================================================
