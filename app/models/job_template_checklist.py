"""
Job Template Checklist model for checklist items in job templates.
Defines the checklist questions and answer types for a job template.
"""

from app.extensions import db


class JobTemplateChecklist(db.Model):
    """
    Checklist item for a job template.
    Defines questions to be answered when completing a job.
    """
    __tablename__ = 'job_template_checklists'

    id = db.Column(db.Integer, primary_key=True)

    # Parent template
    template_id = db.Column(db.Integer, db.ForeignKey('job_templates.id'), nullable=False)

    # Item code for reference
    item_code = db.Column(db.String(20))

    # Question text
    question = db.Column(db.Text, nullable=False)
    question_ar = db.Column(db.Text)

    # Answer type
    # pass_fail: Pass/Fail buttons
    # yes_no: Yes/No buttons
    # numeric: Number input
    # text: Text input
    answer_type = db.Column(db.String(20), default='pass_fail')

    # Whether answer is required
    is_required = db.Column(db.Boolean, default=True)

    # Display order
    order_index = db.Column(db.Integer, default=0)

    # Action to take on failure
    fail_action = db.Column(db.Text)
    fail_action_ar = db.Column(db.Text)

    # Relationships
    template = db.relationship('JobTemplate', back_populates='checklist_items')

    # Constraints
    __table_args__ = (
        db.CheckConstraint(
            "answer_type IN ('pass_fail', 'yes_no', 'numeric', 'text')",
            name='check_checklist_answer_type'
        ),
    )

    def to_dict(self, language='en'):
        """Convert to dictionary."""
        return {
            'id': self.id,
            'template_id': self.template_id,
            'item_code': self.item_code,
            'question': self.question_ar if language == 'ar' and self.question_ar else self.question,
            'question_en': self.question,
            'question_ar': self.question_ar,
            'answer_type': self.answer_type,
            'is_required': self.is_required,
            'order_index': self.order_index,
            'fail_action': self.fail_action_ar if language == 'ar' and self.fail_action_ar else self.fail_action,
            'fail_action_en': self.fail_action,
            'fail_action_ar': self.fail_action_ar,
        }

    def __repr__(self):
        return f'<JobTemplateChecklist template={self.template_id} code={self.item_code}>'
