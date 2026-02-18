"""
Unplanned Job model.
Stores ad-hoc / unplanned work logged by inspectors and specialists
that was not part of their daily work plan.
"""

from app.extensions import db
from datetime import datetime


class UnplannedJob(db.Model):
    """
    Record of unplanned work performed in the field.
    No approval workflow -- purely a log entry so engineers/admins
    have visibility into off-plan activities.
    """
    __tablename__ = 'unplanned_jobs'

    id = db.Column(db.Integer, primary_key=True)

    # Who logged it
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # What equipment / area
    equipment_name = db.Column(db.String(255), nullable=False)

    # What happened
    description = db.Column(db.Text, nullable=False)
    work_done = db.Column(db.Text, nullable=False)

    # Classification
    job_type = db.Column(db.String(30), default='requested_job', nullable=False)
    # 'assist_team' or 'requested_job'

    # Who asked for the work (optional)
    requested_by = db.Column(db.String(255), nullable=True)

    # Optional voice note
    voice_note_url = db.Column(db.String(500), nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', backref='unplanned_jobs', lazy='joined')

    __table_args__ = (
        db.CheckConstraint(
            "job_type IN ('assist_team', 'requested_job')",
            name='check_valid_unplanned_job_type'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'equipment_name': self.equipment_name,
            'description': self.description,
            'work_done': self.work_done,
            'job_type': self.job_type,
            'requested_by': self.requested_by,
            'voice_note_url': self.voice_note_url,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
        }

    def __repr__(self):
        return f'<UnplannedJob {self.id} by user:{self.user_id} - {self.job_type}>'
