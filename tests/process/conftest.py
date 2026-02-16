"""
Shared fixtures for process-based E2E workflow tests.

These fixtures set up a realistic test environment: admin user, inspector,
specialist, equipment, checklist template with items, and inspection assignment.

All fixtures operate through the Flask test client (no direct DB manipulation
for business operations) to validate the real API contracts.
"""

import pytest
from app import create_app
from app.extensions import db as _db
from app.models import (
    User, Equipment, ChecklistTemplate, ChecklistItem,
    InspectionList, InspectionAssignment,
)
from app.models.file import File
from datetime import date, datetime, timedelta


# ---------------------------------------------------------------------------
# Application & Database
# ---------------------------------------------------------------------------

@pytest.fixture(scope='session')
def app():
    """Create application with testing config (in-memory SQLite)."""
    application = create_app('testing')
    with application.app_context():
        _db.create_all()
    yield application
    with application.app_context():
        _db.drop_all()


@pytest.fixture(autouse=True)
def db_session(app):
    """Fresh database for every test function."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.rollback()
        _db.drop_all()


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.test_client()


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(db_session):
    user = User(
        email='admin@process-test.com',
        full_name='Process Admin',
        role='admin',
        role_id='ADM099',
        shift='day',
    )
    user.set_password('Admin123!')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def inspector_user(db_session):
    """Mechanical inspector for the process tests."""
    user = User(
        email='inspector@process-test.com',
        full_name='Process Inspector',
        role='inspector',
        role_id='INS099',
        specialization='mechanical',
        shift='day',
    )
    user.set_password('Inspect123!')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def specialist_user(db_session):
    user = User(
        email='specialist@process-test.com',
        full_name='Process Specialist',
        role='specialist',
        role_id='SPE099',
        shift='day',
    )
    user.set_password('Spec123!')
    db_session.session.add(user)
    db_session.session.commit()
    return user


# ---------------------------------------------------------------------------
# Equipment
# ---------------------------------------------------------------------------

@pytest.fixture
def test_equipment(db_session):
    eq = Equipment(
        name='TEST-PUMP-E2E',
        equipment_type='Centrifugal Pump',
        serial_number='E2E-PUMP-001',
        location='Test Area',
        berth='east',
        status='active',
    )
    db_session.session.add(eq)
    db_session.session.commit()
    return eq


# ---------------------------------------------------------------------------
# Checklist Template with Items
# ---------------------------------------------------------------------------

@pytest.fixture
def test_template(db_session, admin_user):
    """Template with 4 items: 2 pass_fail (1 critical), 1 yes_no, 1 text."""
    tmpl = ChecklistTemplate(
        name='E2E Process Template',
        description='Template for process tests',
        function='Pump Function',
        assembly='Pump Assembly',
        part='Pump Impeller',
        equipment_type='Centrifugal Pump',
        version='E2E-1.0',
        is_active=True,
        created_by_id=admin_user.id,
    )
    db_session.session.add(tmpl)
    db_session.session.flush()

    items_data = [
        {
            'question_text': 'Visual inspection - no external leaks?',
            'answer_type': 'pass_fail',
            'is_required': True,
            'order_index': 1,
            'category': 'mechanical',
            'critical_failure': False,
        },
        {
            'question_text': 'Vibration levels within tolerance?',
            'answer_type': 'pass_fail',
            'is_required': True,
            'order_index': 2,
            'category': 'mechanical',
            'critical_failure': True,  # <-- CRITICAL
        },
        {
            'question_text': 'Safety guard installed?',
            'answer_type': 'yes_no',
            'is_required': True,
            'order_index': 3,
            'category': 'mechanical',
            'critical_failure': False,
        },
        {
            'question_text': 'Additional observations',
            'answer_type': 'text',
            'is_required': False,
            'order_index': 4,
            'category': None,
            'critical_failure': False,
        },
    ]

    for item_data in items_data:
        item = ChecklistItem(template_id=tmpl.id, **item_data)
        db_session.session.add(item)

    db_session.session.commit()
    return tmpl


# ---------------------------------------------------------------------------
# Inspection Assignment (links equipment -> inspector -> template)
# ---------------------------------------------------------------------------

@pytest.fixture
def test_assignment(db_session, test_equipment, test_template, inspector_user):
    """
    Create an InspectionList + InspectionAssignment so that
    the inspector can start an inspection for the test equipment.
    """
    il = InspectionList(
        shift='day',
        target_date=date.today(),
        status='partially_assigned',
        total_assets=1,
        assigned_assets=1,
        completed_assets=0,
    )
    db_session.session.add(il)
    db_session.session.flush()

    assignment = InspectionAssignment(
        inspection_list_id=il.id,
        equipment_id=test_equipment.id,
        template_id=test_template.id,
        berth='east',
        shift='day',
        status='assigned',
        mechanical_inspector_id=inspector_user.id,
        assigned_at=datetime.utcnow(),
        deadline=datetime.utcnow() + timedelta(hours=30),
    )
    db_session.session.add(assignment)
    db_session.session.commit()
    return assignment


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def login(client, email, password):
    """Login and return (access_token, auth_header_dict)."""
    resp = client.post('/api/auth/login', json={
        'email': email,
        'password': password,
    })
    data = resp.get_json()
    token = data.get('access_token', '')
    return token, {'Authorization': f'Bearer {token}'}


def make_voice_note(db_session, user_id):
    """Create a dummy voice note File record for test evidence."""
    f = File(
        original_filename='voice_note.webm',
        stored_filename=f'voice_{user_id}_{datetime.utcnow().timestamp()}.webm',
        file_path='/uploads/test_voice.webm',
        file_size=1024,
        mime_type='audio/webm',
        uploaded_by=user_id,
        related_type='inspection_answer',
    )
    db_session.session.add(f)
    db_session.session.flush()
    return f.id
