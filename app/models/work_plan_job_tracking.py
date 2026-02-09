"""
Work Plan Job Tracking model.
Tracks execution state of work plan jobs (start/pause/resume/complete).
One-to-one relationship with WorkPlanJob.
"""

from app.extensions import db
from datetime import datetime


class WorkPlanJobTracking(db.Model):
    """
    Execution tracking for a work plan job.
    Created when a worker starts a job. Tracks status, timestamps, and actual hours.
    """
    __tablename__ = 'work_plan_job_trackings'

    id = db.Column(db.Integer, primary_key=True)

    # One-to-one with WorkPlanJob
    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), unique=True, nullable=False, index=True)

    # Execution status
    status = db.Column(db.String(30), default='pending', nullable=False, index=True)
    # pending, in_progress, paused, completed, incomplete, not_started

    # Shift info
    shift_type = db.Column(db.String(10), default='day', nullable=False)
    # day, night

    # Timestamps
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    paused_at = db.Column(db.DateTime, nullable=True)  # Current pause start
    total_paused_minutes = db.Column(db.Integer, default=0, nullable=False)

    # Actual hours (auto-calculated from start/complete minus pauses)
    actual_hours = db.Column(db.Numeric(5, 2), nullable=True)

    # Carry-over tracking
    is_carry_over = db.Column(db.Boolean, default=False, nullable=False)
    original_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=True)
    carry_over_count = db.Column(db.Integer, default=0, nullable=False)

    # Completion
    completion_photo_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    work_notes = db.Column(db.Text, nullable=True)

    # Handover for incomplete/carry-over
    handover_voice_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    handover_transcription = db.Column(db.Text, nullable=True)

    # Engineer notes (visible to next-day worker)
    engineer_handover_voice_file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=True)
    engineer_handover_transcription = db.Column(db.Text, nullable=True)

    # Incomplete reason
    incomplete_reason_category = db.Column(db.String(30), nullable=True)
    incomplete_reason_details = db.Column(db.Text, nullable=True)

    # Auto-flag tracking
    auto_flagged = db.Column(db.Boolean, default=False, nullable=False)
    auto_flagged_at = db.Column(db.DateTime, nullable=True)
    auto_flag_type = db.Column(db.String(30), nullable=True)  # not_completed, not_started

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    work_plan_job = db.relationship('WorkPlanJob', foreign_keys=[work_plan_job_id], backref='tracking')
    original_job = db.relationship('WorkPlanJob', foreign_keys=[original_job_id])
    completion_photo = db.relationship('File', foreign_keys=[completion_photo_id])
    handover_voice_file = db.relationship('File', foreign_keys=[handover_voice_file_id])
    engineer_handover_voice_file = db.relationship('File', foreign_keys=[engineer_handover_voice_file_id])

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('pending', 'in_progress', 'paused', 'completed', 'incomplete', 'not_started')",
            name='check_valid_tracking_status'
        ),
        db.CheckConstraint(
            "shift_type IN ('day', 'night')",
            name='check_valid_shift_type'
        ),
        db.CheckConstraint(
            "incomplete_reason_category IN ('missing_parts', 'equipment_not_accessible', 'time_ran_out', 'safety_concern', 'other') OR incomplete_reason_category IS NULL",
            name='check_valid_incomplete_reason'
        ),
    )

    def is_running(self):
        """Check if job timer is currently running."""
        return self.status == 'in_progress' and self.started_at and not self.paused_at

    def is_paused(self):
        """Check if job is currently paused."""
        return self.status == 'paused' and self.paused_at is not None

    def calculate_actual_hours(self):
        """Calculate actual hours from timestamps."""
        if not self.started_at or not self.completed_at:
            return None
        total_seconds = (self.completed_at - self.started_at).total_seconds()
        paused_seconds = (self.total_paused_minutes or 0) * 60
        actual_seconds = max(0, total_seconds - paused_seconds)
        return round(actual_seconds / 3600, 2)

    def to_dict(self):
        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'status': self.status,
            'shift_type': self.shift_type,
            'started_at': (self.started_at.isoformat() + 'Z') if self.started_at else None,
            'completed_at': (self.completed_at.isoformat() + 'Z') if self.completed_at else None,
            'paused_at': (self.paused_at.isoformat() + 'Z') if self.paused_at else None,
            'total_paused_minutes': self.total_paused_minutes,
            'actual_hours': float(self.actual_hours) if self.actual_hours else None,
            'is_carry_over': self.is_carry_over,
            'original_job_id': self.original_job_id,
            'carry_over_count': self.carry_over_count,
            'completion_photo_id': self.completion_photo_id,
            'completion_photo_url': self.completion_photo.file_path if self.completion_photo else None,
            'work_notes': self.work_notes,
            'handover_voice_file_id': self.handover_voice_file_id,
            'handover_voice_url': self.handover_voice_file.file_path if self.handover_voice_file else None,
            'handover_transcription': self.handover_transcription,
            'engineer_handover_voice_file_id': self.engineer_handover_voice_file_id,
            'engineer_handover_voice_url': self.engineer_handover_voice_file.file_path if self.engineer_handover_voice_file else None,
            'engineer_handover_transcription': self.engineer_handover_transcription,
            'incomplete_reason_category': self.incomplete_reason_category,
            'incomplete_reason_details': self.incomplete_reason_details,
            'auto_flagged': self.auto_flagged,
            'auto_flagged_at': (self.auto_flagged_at.isoformat() + 'Z') if self.auto_flagged_at else None,
            'auto_flag_type': self.auto_flag_type,
            'is_running': self.is_running(),
            'is_paused': self.is_paused(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<WorkPlanJobTracking job:{self.work_plan_job_id} - {self.status}>'
