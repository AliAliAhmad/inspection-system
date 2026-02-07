"""
Import Log model for tracking Excel import history.
"""

from app.extensions import db
from datetime import datetime


class ImportLog(db.Model):
    """
    Tracks history of Excel imports for team and equipment.
    """
    __tablename__ = 'import_logs'

    id = db.Column(db.Integer, primary_key=True)

    # Import type: 'team' or 'equipment'
    import_type = db.Column(db.String(20), nullable=False)

    # Who performed the import
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # File info
    file_name = db.Column(db.String(255), nullable=True)

    # Results
    total_rows = db.Column(db.Integer, default=0)
    created_count = db.Column(db.Integer, default=0)
    updated_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)

    # Details (JSON) - for equipment type breakdown, failed row details, etc.
    details = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    admin = db.relationship('User', foreign_keys=[admin_id])

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'import_type': self.import_type,
            'admin_id': self.admin_id,
            'admin_name': self.admin.full_name if self.admin else None,
            'file_name': self.file_name,
            'total_rows': self.total_rows,
            'created_count': self.created_count,
            'updated_count': self.updated_count,
            'failed_count': self.failed_count,
            'details': json.loads(self.details) if self.details else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<ImportLog {self.import_type} by {self.admin_id} at {self.created_at}>'
