"""
Specialist Job Model
Tracks repair/maintenance jobs assigned to Technical Specialists.
Enhanced with QC, cleaning rating, categorization, and incomplete workflow.
"""

from app.extensions import db
from datetime import datetime
from decimal import Decimal


class SpecialistJob(db.Model):
    """Repair/maintenance job for Technical Specialist"""

    __tablename__ = 'specialist_jobs'

    # Primary Key
    id = db.Column(db.Integer, primary_key=True)

    # Dual ID System
    universal_id = db.Column(db.Integer, unique=True, nullable=False, index=True)
    job_id = db.Column(db.String(50), unique=True, nullable=False, index=True)  # SPE001-001

    # Related Defect
    defect_id = db.Column(db.Integer, db.ForeignKey('defects.id'), nullable=False, unique=True)

    # Assignment
    specialist_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    assigned_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Job categorization
    category = db.Column(db.String(20), nullable=True)  # 'major' or 'minor'
    major_reason = db.Column(db.Text, nullable=True)

    # PLANNED TIME (CRITICAL - MUST BE ENTERED BEFORE VIEWING DETAILS)
    planned_time_hours = db.Column(db.Numeric(5, 2))
    planned_time_entered_at = db.Column(db.DateTime)

    # DETAILS ACCESS CONTROL
    details_viewed_at = db.Column(db.DateTime)

    # Work Execution
    started_at = db.Column(db.DateTime)
    paused_at = db.Column(db.DateTime)
    paused_duration_minutes = db.Column(db.Integer, default=0)
    completed_at = db.Column(db.DateTime)
    actual_time_hours = db.Column(db.Numeric(5, 2))

    # Work Completion Data
    work_notes = db.Column(db.Text)

    # Wrong Finding
    wrong_finding_reason = db.Column(db.Text, nullable=True)
    wrong_finding_photo = db.Column(db.String(500), nullable=True)

    # Status
    status = db.Column(
        db.String(50),
        default='assigned',
        nullable=False,
        index=True
    )  # 'assigned', 'in_progress', 'paused', 'completed', 'cancelled'

    # Completion Status
    completion_status = db.Column(db.String(50))  # 'pass', 'incomplete'
    incomplete_reason = db.Column(db.Text)

    # Quality Engineer assignment
    qe_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Ratings
    time_rating = db.Column(db.Numeric(3, 1))
    qc_rating = db.Column(db.Numeric(3, 1))
    cleaning_rating = db.Column(db.Integer)  # 0, 1, or 2 stars
    admin_bonus = db.Column(db.Integer, default=0)  # 0-10 stars

    # Assessment reference
    assessment_id = db.Column(db.Integer, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    defect = db.relationship('Defect', backref='specialist_job')
    specialist = db.relationship('User', foreign_keys=[specialist_id], backref='specialist_jobs')
    assigner = db.relationship('User', foreign_keys=[assigned_by])
    quality_engineer = db.relationship('User', foreign_keys=[qe_id])

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('assigned', 'in_progress', 'paused', 'completed', 'incomplete', 'qc_approved', 'cancelled')",
            name='check_valid_job_status'
        ),
        db.CheckConstraint(
            "completion_status IN ('pass', 'incomplete') OR completion_status IS NULL",
            name='check_valid_completion_status'
        ),
        db.CheckConstraint(
            "planned_time_hours > 0 OR planned_time_hours IS NULL",
            name='check_positive_planned_time'
        ),
        db.CheckConstraint(
            "category IN ('major', 'minor') OR category IS NULL",
            name='check_valid_job_category'
        ),
        db.CheckConstraint(
            "cleaning_rating >= 0 AND cleaning_rating <= 2 OR cleaning_rating IS NULL",
            name='check_valid_cleaning_rating'
        ),
        db.CheckConstraint(
            "admin_bonus >= 0 AND admin_bonus <= 10",
            name='check_valid_admin_bonus'
        ),
    )

    def has_planned_time(self):
        """Check if planned time has been entered"""
        return self.planned_time_hours is not None and self.planned_time_hours > 0

    def can_view_details(self):
        """Check if specialist can view full job details"""
        return self.has_planned_time()

    def is_running(self):
        """Check if timer is currently running"""
        return self.status == 'in_progress' and self.started_at and not self.completed_at

    def is_paused(self):
        """Check if job is currently paused"""
        return self.status == 'paused' and self.paused_at is not None

    def calculate_time_rating(self):
        """
        Calculate time rating based on planned vs actual time.
        Base: 5 stars. Early: +2 if <2h early, +4 if 2h+ early.
        Late: -1 star per 0.5 hour late. Clamp 1-7.
        """
        if not self.planned_time_hours or not self.actual_time_hours:
            return None

        planned = float(self.planned_time_hours)
        actual = float(self.actual_time_hours)
        difference = planned - actual

        rating = 5.0

        if difference > 0:
            if difference < 2:
                rating += 2.0
            else:
                rating += 4.0
        elif difference < 0:
            hours_late = abs(difference)
            penalty = int(hours_late / 0.5) * 1.0
            rating -= penalty

        return max(1.0, min(7.0, rating))

    def calculate_total_rating(self):
        """Calculate total rating from all components."""
        total = 0.0
        count = 0
        if self.time_rating:
            total += float(self.time_rating)
            count += 1
        if self.qc_rating:
            total += float(self.qc_rating)
            count += 1
        if self.cleaning_rating is not None:
            total += self.cleaning_rating
            count += 1
        if self.admin_bonus:
            total += self.admin_bonus
        return total

    def to_dict(self, include_details=True, language='en'):
        """Convert job to dictionary."""
        data = {
            'id': self.id,
            'universal_id': self.universal_id,
            'job_id': self.job_id,
            'defect_id': self.defect_id,
            'specialist_id': self.specialist_id,
            'status': self.status,
            'category': self.category,
            'has_planned_time': self.has_planned_time(),
            'can_view_details': self.can_view_details(),
            'wrong_finding_reason': self.wrong_finding_reason,
            'wrong_finding_photo': self.wrong_finding_photo,
        }

        if include_details and self.can_view_details():
            # Get bilingual text for user-submitted fields
            from app.utils.bilingual import get_bilingual_fields
            text_fields = {}
            if self.work_notes:
                text_fields['work_notes'] = self.work_notes
            if self.incomplete_reason:
                text_fields['incomplete_reason'] = self.incomplete_reason
            if self.major_reason:
                text_fields['major_reason'] = self.major_reason

            if text_fields:
                translated = get_bilingual_fields('specialist_job', self.id, text_fields, language)
            else:
                translated = {}

            data.update({
                'planned_time_hours': float(self.planned_time_hours) if self.planned_time_hours else None,
                'started_at': self.started_at.isoformat() if self.started_at else None,
                'completed_at': self.completed_at.isoformat() if self.completed_at else None,
                'actual_time_hours': float(self.actual_time_hours) if self.actual_time_hours else None,
                'work_notes': translated.get('work_notes', self.work_notes),
                'completion_status': self.completion_status,
                'incomplete_reason': translated.get('incomplete_reason', self.incomplete_reason),
                'major_reason': translated.get('major_reason', self.major_reason),
                'time_rating': float(self.time_rating) if self.time_rating else None,
                'qc_rating': float(self.qc_rating) if self.qc_rating else None,
                'cleaning_rating': self.cleaning_rating,
                'admin_bonus': self.admin_bonus,
                'qe_id': self.qe_id,
                'is_running': self.is_running(),
                'is_paused': self.is_paused(),
            })

        return data

    def __repr__(self):
        return f'<SpecialistJob {self.job_id} - {self.status}>'
