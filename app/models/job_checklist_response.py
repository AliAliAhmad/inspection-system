"""
Job Checklist Response model for storing responses to job checklists.
Tracks answers, pass/fail status, notes, and photos for each checklist item.
"""

from app.extensions import db
from datetime import datetime


class JobChecklistResponse(db.Model):
    """
    Response to a checklist item for a work plan job.
    Stores the answer, status, and supporting evidence.
    """
    __tablename__ = 'job_checklist_responses'

    id = db.Column(db.Integer, primary_key=True)

    # Parent job
    work_plan_job_id = db.Column(db.Integer, db.ForeignKey('work_plan_jobs.id'), nullable=False)

    # Original checklist item (optional, for reference)
    checklist_item_id = db.Column(db.Integer, db.ForeignKey('job_template_checklists.id'))

    # Question text (copied from template for history preservation)
    question = db.Column(db.Text, nullable=False)

    # Answer type
    answer_type = db.Column(db.String(20))  # pass_fail, yes_no, numeric, text

    # Answer value
    answer_value = db.Column(db.String(500))  # pass/fail, yes/no, number, or text

    # Pass/Fail status (derived from answer for pass_fail and yes_no types)
    is_passed = db.Column(db.Boolean)

    # Additional notes
    notes = db.Column(db.Text)

    # Supporting photo
    photo_file_id = db.Column(db.Integer, db.ForeignKey('files.id'))

    # Who answered
    answered_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # When answered
    answered_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    job = db.relationship('WorkPlanJob', backref='checklist_responses')
    checklist_item = db.relationship('JobTemplateChecklist')
    photo_file = db.relationship('File')
    answered_by = db.relationship('User')

    def to_dict(self):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'work_plan_job_id': self.work_plan_job_id,
            'checklist_item_id': self.checklist_item_id,
            'question': self.question,
            'answer_type': self.answer_type,
            'answer_value': self.answer_value,
            'is_passed': self.is_passed,
            'notes': self.notes,
            'photo_file_id': self.photo_file_id,
            'photo_url': self.photo_file.get_url() if self.photo_file else None,
            'answered_by_id': self.answered_by_id,
            'answered_by': self.answered_by.to_dict() if self.answered_by else None,
            'answered_at': self.answered_at.isoformat() if self.answered_at else None,
        }

    def __repr__(self):
        return f'<JobChecklistResponse job={self.work_plan_job_id} item={self.checklist_item_id}>'
