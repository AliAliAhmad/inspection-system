"""
Generic Translation model.
Stores bilingual translations for any free-text field in any model.
"""

from app.extensions import db
from datetime import datetime


class Translation(db.Model):
    """
    Stores translated text for any model's text fields.
    When a user writes in English, the Arabic translation is stored here, and vice versa.
    """
    __tablename__ = 'translations'

    id = db.Column(db.Integer, primary_key=True)
    model_type = db.Column(db.String(50), nullable=False, index=True)  # e.g. 'specialist_job'
    model_id = db.Column(db.Integer, nullable=False, index=True)
    field_name = db.Column(db.String(50), nullable=False)  # e.g. 'work_notes'
    original_lang = db.Column(db.String(2), nullable=False)  # 'en' or 'ar'
    translated_text = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('model_type', 'model_id', 'field_name',
                            name='uq_translation_model_field'),
        db.Index('ix_translation_lookup', 'model_type', 'model_id'),
    )

    def __repr__(self):
        return f'<Translation {self.model_type}:{self.model_id}.{self.field_name}>'
