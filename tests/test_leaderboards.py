"""
Tests for leaderboards and bonus stars.
"""

from tests.conftest import get_auth_header
from app.models import BonusStar


class TestLeaderboards:
    def test_overall_leaderboard(self, client, admin_user, mech_inspector):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/leaderboards', headers=headers)
        assert resp.status_code == 200

    def test_inspector_leaderboard(self, client, admin_user, mech_inspector):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/leaderboards/inspectors', headers=headers)
        assert resp.status_code == 200

    def test_specialist_leaderboard(self, client, admin_user, specialist):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/leaderboards/specialists', headers=headers)
        assert resp.status_code == 200


class TestBonusStars:
    def test_award_bonus(self, client, admin_user, specialist, db_session):
        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.post('/api/bonus-stars', json={
            'user_id': specialist.id,
            'amount': 5,
            'reason': 'Excellent work on pump repair',
        }, headers=headers)
        assert resp.status_code in (200, 201)

    def test_list_bonus_stars(self, client, admin_user, specialist, db_session):
        star = BonusStar(
            user_id=specialist.id,
            awarded_by=admin_user.id,
            amount=3,
            reason='Good job',
        )
        db_session.session.add(star)
        db_session.session.commit()

        headers = get_auth_header(client, 'admin@test.com', 'admin123')
        resp = client.get('/api/bonus-stars', headers=headers)
        assert resp.status_code == 200

    def test_bonus_model(self, db_session, admin_user, specialist):
        star = BonusStar(
            user_id=specialist.id,
            awarded_by=admin_user.id,
            amount=7,
            reason='Outstanding performance',
            related_job_type='specialist',
            related_job_id=1,
        )
        db_session.session.add(star)
        db_session.session.commit()
        assert star.id is not None
        assert star.amount == 7
