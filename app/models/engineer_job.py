"""
Engineer Job Model.
Tracks projects and tasks assigned to Engineers.
Three types: custom_project, system_review, special_task.
"""

from app.extensions import db
from datetime import datetime


class EngineerJob(db.Model):
    """Engineer project/task with timer and rating system."""
    __tablename__ = 'engineer_jobs'

    id = db.Column(db.Integer, primary_key=True)

    # Dual ID System
    universal_id = db.Column(db.Integer, unique=True, nullable=False, index=True)
    job_id = db.Column(db.String(50), unique=True, nullable=False, index=True)  # ENG001-001

    # Assignment
    engineer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    assigned_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Job type
    job_type = db.Column(db.String(30), nullable=False)  # custom_project, system_review, special_task

    # Related equipment (optional)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=True)

    # Related inspection/defect (for system_review type)
    related_type = db.Column(db.String(30), nullable=True)  # 'inspection' or 'defect'
    related_id = db.Column(db.Integer, nullable=True)

    # Job details
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)

    # Categorization
    category = db.Column(db.String(20), nullable=True)  # 'major' or 'minor'
    major_reason = db.Column(db.Text, nullable=True)

    # Timing
    planned_time_days = db.Column(db.Integer, nullable=True)
    planned_time_hours = db.Column(db.Numeric(5, 2), nullable=True)
    planned_time_entered_at = db.Column(db.DateTime, nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    paused_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    actual_time_hours = db.Column(db.Numeric(5, 2), nullable=True)
    paused_duration_minutes = db.Column(db.Integer, default=0)

    # Status
    status = db.Column(db.String(30), default='assigned')  # assigned, in_progress, paused, completed

    # Completion
    work_notes = db.Column(db.Text, nullable=True)
    completion_status = db.Column(db.String(20), nullable=True)  # pass, incomplete

    # Quality Engineer
    qe_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Ratings
    time_rating = db.Column(db.Numeric(3, 1), nullable=True)
    qc_rating = db.Column(db.Numeric(3, 1), nullable=True)
    admin_bonus = db.Column(db.Integer, default=0)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    engineer = db.relationship('User', foreign_keys=[engineer_id], backref='engineer_jobs')
    assigner = db.relationship('User', foreign_keys=[assigned_by])
    equipment = db.relationship('Equipment')
    quality_engineer = db.relationship('User', foreign_keys=[qe_id])

    __table_args__ = (
        db.CheckConstraint(
            "job_type IN ('custom_project', 'system_review', 'special_task')",
            name='check_valid_eng_job_type'
        ),
        db.CheckConstraint(
            "status IN ('assigned', 'in_progress', 'paused', 'completed', 'incomplete', 'qc_approved')",
            name='check_valid_eng_job_status'
        ),
        db.CheckConstraint(
            "category IN ('major', 'minor') OR category IS NULL",
            name='check_valid_eng_job_category'
        ),
    )

    def has_pending_pause(self):
        """Check if there is a pending pause request for this job"""
        from app.models.pause_log import PauseLog
        return PauseLog.query.filter_by(
            job_type='engineer', job_id=self.id, status='pending'
        ).first() is not None

    def calculate_time_rating(self):
        """Same rating logic as specialist jobs."""
        if not self.planned_time_hours or not self.actual_time_hours:
            return None
        planned = float(self.planned_time_hours)
        actual = float(self.actual_time_hours)
        difference = planned - actual
        rating = 5.0
        if difference > 0:
            rating += 2.0 if difference < 2 else 4.0
        elif difference < 0:
            rating -= int(abs(difference) / 0.5) * 1.0
        return max(1.0, min(7.0, rating))

    def to_dict(self, language='en'):
        from app.utils.bilingual import get_bilingual_fields
        text_fields = {'title': self.title, 'description': self.description}
        if self.work_notes:
            text_fields['work_notes'] = self.work_notes
        if self.major_reason:
            text_fields['major_reason'] = self.major_reason

        translated = get_bilingual_fields('engineer_job', self.id, text_fields, language)

        return {
            'id': self.id,
            'universal_id': self.universal_id,
            'job_id': self.job_id,
            'engineer_id': self.engineer_id,
            'job_type': self.job_type,
            'equipment_id': self.equipment_id,
            'title': translated.get('title', self.title),
            'description': translated.get('description', self.description),
            'category': self.category,
            'major_reason': translated.get('major_reason', self.major_reason),
            'planned_time_days': self.planned_time_days,
            'planned_time_hours': float(self.planned_time_hours) if self.planned_time_hours else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'actual_time_hours': float(self.actual_time_hours) if self.actual_time_hours else None,
            'status': self.status,
            'work_notes': translated.get('work_notes', self.work_notes),
            'completion_status': self.completion_status,
            'time_rating': float(self.time_rating) if self.time_rating else None,
            'qc_rating': float(self.qc_rating) if self.qc_rating else None,
            'admin_bonus': self.admin_bonus,
            'qe_id': self.qe_id,
            'is_running': self.status == 'in_progress' and self.started_at is not None and not self.has_pending_pause(),
            'has_pending_pause': self.has_pending_pause(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'defect': self._get_defect_dict(language),
        }

    def _get_defect_dict(self, language='en'):
        """Get related defect with inspection answer if this is a defect-related job."""
        if self.related_type == 'defect' and self.related_id:
            from app.models.defect import Defect
            defect = db.session.get(Defect, self.related_id)
            if defect:
                return defect.to_dict(language=language)
        return None

    def __repr__(self):
        return f'<EngineerJob {self.job_id} - {self.status}>'
