"""
Work Plan Carry Over model.
Links incomplete jobs to their next-day continuation.
Includes voice handover notes with AI transcription.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanCarryOver(db.Model):
    """
    Carry-over record linking an incomplete job to its new next-day job.
    Preserves full history: Day 1 worked X hours, Day 2 continued and completed.
    """
    __tablename__ = 'work_plan_carry_overs'

    id = db.Column(db.Integer, primary_key=True)

    # Original incomplete job
    original_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False, index=True)

    # New job created for next day
    new_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False, index=True)

    # Reason for carry-over
    reason_category = db.Column(db.String(30), nullable=False)
    reason_details = db.Column(db.Text, nullable=True)

    # Worker handover voice note
    worker_voice_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    worker_transcription = db.Column(db.Text, nullable=True)

    # Engineer handover voice note
    engineer_voice_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    engineer_transcription = db.Column(db.Text, nullable=True)

    # Hours spent on original job
    hours_spent_original = db.Column(db.Numeric(5, 2), nullable=True)

    # Who initiated the carry-over
    carried_over_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    carried_over_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Part of which daily review
    daily_review_id = db.Column(db.Integer, db.ForeignKey('work_plan_daily_reviews.id'), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    original_job = db.relationship('WorkPlanJob', foreign_keys=[original_job_id], backref='carry_over_from')
    new_job = db.relationship('WorkPlanJob', foreign_keys=[new_job_id], backref='carry_over_to')
    carrier = db.relationship('User', foreign_keys=[carried_over_by_id])
    worker_voice_file = db.relationship('File', foreign_keys=[worker_voice_file_id])
    engineer_voice_file = db.relationship('File', foreign_keys=[engineer_voice_file_id])

    __table_args__ = (
        db.CheckConstraint(
            "reason_category IN ('missing_parts', 'equipment_not_accessible', 'time_ran_out', 'safety_concern', 'day_ended', 'other')",
            name='check_valid_carry_over_reason'
        ),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'original_job_id': self.original_job_id,
            'new_job_id': self.new_job_id,
            'reason_category': self.reason_category,
            'reason_details': self.reason_details,
            'worker_voice_file_id': self.worker_voice_file_id,
            'worker_voice_url': self.worker_voice_file.file_path if self.worker_voice_file else None,
            'worker_transcription': self.worker_transcription,
            'engineer_voice_file_id': self.engineer_voice_file_id,
            'engineer_voice_url': self.engineer_voice_file.file_path if self.engineer_voice_file else None,
            'engineer_transcription': self.engineer_transcription,
            'hours_spent_original': float(self.hours_spent_original) if self.hours_spent_original else None,
            'carried_over_by_id': self.carried_over_by_id,
            'carrier': {
                'id': self.carrier.id,
                'full_name': self.carrier.full_name,
            } if self.carrier else None,
            'carried_over_at': (self.carried_over_at.isoformat() + 'Z') if self.carried_over_at else None,
            'daily_review_id': self.daily_review_id,
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanCarryOver {self.original_job_id} -> {self.new_job_id}>'
