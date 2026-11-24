"""Each role list is written ONCE (knot report 2026-11-24).

`PLANNING_ROLES` was pasted into four files and `CREW_ROLES` was kept equal to
/users/for-assignment by hand. They live in app/utils/roles.py now. These tests
stop a fifth copy appearing, and pin the one copy that cannot import Python —
the web board's supervisor list — to the server's.
"""

import ast
import pathlib
import re

from app.utils.roles import CREW_ROLES, PLANNING_ROLES, SUPERVISOR_ROLES
from tests.conftest import get_auth_header

ROOT = pathlib.Path(__file__).resolve().parents[1]
ROLE_LISTS = {'PLANNING_ROLES', 'SUPERVISOR_ROLES', 'CREW_ROLES'}


def test_each_role_list_is_assigned_only_in_roles_py():
    offenders = []
    for path in (ROOT / 'app').rglob('*.py'):
        if path.name == 'roles.py' and path.parent.name == 'utils':
            continue
        tree = ast.parse(path.read_text(encoding='utf-8'))
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in ROLE_LISTS:
                        offenders.append(f'{path.relative_to(ROOT)}:{node.lineno} {target.id}')
    assert offenders == [], 'a second copy of a role list: ' + ', '.join(offenders)


def test_the_web_supervisor_list_matches_the_server():
    page = (ROOT / 'frontend/apps/web/src/pages/admin/WorkPlanningPage.tsx').read_text(
        encoding='utf-8')
    match = re.search(r'const SUPERVISOR_ROLES[^=]*=\s*\[([^\]]*)\]', page)
    assert match, 'WorkPlanningPage.tsx no longer declares SUPERVISOR_ROLES'
    web = set(re.findall(r"'([a-z_]+)'", match.group(1)))
    assert web == set(SUPERVISOR_ROLES)


def test_the_web_holds_no_other_hand_typed_copy():
    page = (ROOT / 'frontend/apps/web/src/pages/admin/WorkPlanningPage.tsx').read_text(
        encoding='utf-8')
    assert page.count("['engineer', 'admin', 'specialist', 'maintenance']") == 1


def test_the_lists_are_what_ali_decided():
    assert set(PLANNING_ROLES) == {'admin', 'engineer'}
    assert set(SUPERVISOR_ROLES) == {'engineer', 'admin', 'specialist', 'maintenance'}
    assert set(CREW_ROLES) == {'inspector', 'specialist', 'maintenance', 'engineer', 'admin'}


def test_for_assignment_offers_exactly_the_crew_roles(client, db_session, admin_user):
    from app.models import User
    for role in ('inspector', 'specialist', 'maintenance', 'engineer', 'quality_engineer'):
        user = User(email=f'r-{role}@t.iq', full_name=f'R {role}', role=role,
                    role_id=f'RS-{role}', specialization='mechanical', shift='day')
        user.set_password('x')
        db_session.session.add(user)
    db_session.session.commit()

    response = client.get('/api/users/for-assignment', headers=get_auth_header(client, admin_user.email, 'admin123'))

    assert response.status_code == 200
    body = response.get_json()
    users = body.get('data', body) if isinstance(body, dict) else body
    assert {u['role'] for u in users} <= set(CREW_ROLES)
    assert 'quality_engineer' not in {u['role'] for u in users}
