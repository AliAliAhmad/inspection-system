"""
Sync Queue Model
For offline submission support
"""

from app.extensions import db
from datetime import datetime


class SyncQueue(db.Model):
    """Queue for offline submissions"""
    
    __tablename__ = 'sync_queue'
    
    # Primary Key
    id = db.Column(db.Integer, primary_key=True)
    
    # User who created this offline action
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Action Details
    entity_type = db.Column(db.String(50), nullable=False)  # 'inspection', 'job', etc.
    entity_data = db.Column(db.JSON, nullable=False)  # Full data to sync
    
    # Sync Status
    synced_at = db.Column(db.DateTime)
    sync_error = db.Column(db.Text)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    user = db.relationship('User', backref='sync_queue_items')
    
    def is_synced(self):
        """Check if item has been synced"""
        return self.synced_at is not None
    
    def mark_as_synced(self):
        """Mark item as successfully synced"""
        self.synced_at = datetime.utcnow()
        self.sync_error = None
    
    def mark_sync_error(self, error_message):
        """Mark item as failed to sync"""
        self.sync_error = error_message
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'entity_type': self.entity_type,
            'entity_data': self.entity_data,
            'is_synced': self.is_synced(),
            'synced_at': self.synced_at.isoformat() if self.synced_at else None,
            'sync_error': self.sync_error,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<SyncQueue {self.entity_type} - {"synced" if self.is_synced() else "pending"}>'