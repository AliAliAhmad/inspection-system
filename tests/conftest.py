"""
Shared test fixtures for the inspection system test suite.
"""

import pytest
from app import create_app
from app.extensions import db as _db
from app.models import User, Equipment


@pytest.fixture(scope='session')
def app():
    """Create application for testing."""
    app = create_app('testing')
    with app.app_context():
        _db.create_all()
    yield app
    with app.app_context():
        _db.drop_all()


@pytest.fixture(autouse=True)
def db_session(app):
    """Create a fresh database session for each test."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.rollback()
        _db.drop_all()


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture
def admin_user(db_session):
    """Create an admin user."""
    user = User(
        email='admin@test.com',
        full_name='Test Admin',
        role='admin',
        role_id='ADM001',
        shift='day',
    )
    user.set_password('admin123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def mech_inspector(db_session):
    """Create a mechanical inspector."""
    user = User(
        email='mech@test.com',
        full_name='Mechanical Inspector',
        role='inspector',
        role_id='INS001',
        specialization='mechanical',
        shift='day',
    )
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def elec_inspector(db_session):
    """Create an electrical inspector."""
    user = User(
        email='elec@test.com',
        full_name='Electrical Inspector',
        role='inspector',
        role_id='INS002',
        specialization='electrical',
        shift='day',
    )
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def specialist(db_session):
    """Create a specialist user."""
    user = User(
        email='spec@test.com',
        full_name='Test Specialist',
        role='specialist',
        role_id='SPE001',
        shift='day',
    )
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def engineer(db_session):
    """Create an engineer user."""
    user = User(
        email='eng@test.com',
        full_name='Test Engineer',
        role='engineer',
        role_id='ENG001',
        shift='day',
    )
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def qe_user(db_session):
    """Create a quality engineer user."""
    user = User(
        email='qe@test.com',
        full_name='Test QE',
        role='quality_engineer',
        role_id='QE001',
        shift='day',
    )
    user.set_password('test123')
    db_session.session.add(user)
    db_session.session.commit()
    return user


@pytest.fixture
def sample_equipment(db_session):
    """Create a sample equipment item."""
    eq = Equipment(
        name='Test Pump',
        equipment_type='centrifugal_pump',
        serial_number='TP-001',
        location='Building A',
        berth='B20',
        status='active',
    )
    db_session.session.add(eq)
    db_session.session.commit()
    return eq


def make_equipment(db_session, name='Test Pump', serial='TP-001'):
    """Helper to create equipment with required fields."""
    eq = Equipment(
        name=name,
        equipment_type='centrifugal_pump',
        serial_number=serial,
        location='Area A',
        berth='B20',
        status='active',
    )
    db_session.session.add(eq)
    db_session.session.flush()
    return eq


def get_auth_header(client, email, password):
    """Helper to login and return auth header dict."""
    resp = client.post('/api/auth/login', json={
        'email': email,
        'password': password
    })
    token = resp.get_json()['access_token']
    return {'Authorization': f'Bearer {token}'}
