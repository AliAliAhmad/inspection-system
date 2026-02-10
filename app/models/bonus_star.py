"""
Bonus Star model.
Tracks bonus/reward stars awarded by admin, engineer, or requested by QE.
"""

from app.extensions import db
from datetime import datetime


class BonusStar(db.Model):
    """
    Bonus stars awarded to users for exceptional performance.
    Admin/Engineer: award directly (1-10 stars).
    QE: can request admin to award.
    """
    __tablename__ = 'bonus_stars'

    id = db.Column(db.Integer, primary_key=True)

    # Recipient
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Awarding
    awarded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    amount = db.Column(db.Integer, nullable=False)  # 1-10 stars
    reason = db.Column(db.Text, nullable=False)

    # Related job (optional)
    related_job_type = db.Column(db.String(30), nullable=True)  # specialist, engineer, inspection
    related_job_id = db.Column(db.Integer, nullable=True)

    # If requested by QE
    is_qe_request = db.Column(db.Boolean, default=False)
    qe_requester_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    request_status = db.Column(db.String(20), nullable=True)  # pending, approved, rejected, modified
    admin_modified_amount = db.Column(db.Integer, nullable=True)

    awarded_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='bonus_stars_received')
    awarder = db.relationship('User', foreign_keys=[awarded_by])
    qe_requester = db.relationship('User', foreign_keys=[qe_requester_id])

    __table_args__ = (
        db.CheckConstraint('amount >= 1 AND amount <= 10', name='check_valid_bonus_amount'),
    )

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_text
        reason = get_bilingual_text(
            'bonus_star', self.id, 'reason', self.reason, language
        ) if self.reason else self.reason

        return {
            'id': self.id,
            'user_id': self.user_id,
            'awarded_by': self.awarded_by,
            'amount': self.amount,
            'reason': reason,
            'related_job_type': self.related_job_type,
            'related_job_id': self.related_job_id,
            'is_qe_request': self.is_qe_request,
            'request_status': self.request_status,
            'awarded_at': self.awarded_at.isoformat() if self.awarded_at else None
        }

    def __repr__(self):
        return f'<BonusStar {self.amount} stars to User:{self.user_id}>'
