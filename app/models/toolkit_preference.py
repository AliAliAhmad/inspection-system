"""Toolkit Preference model for mobile toolkit settings."""
from datetime import datetime
from app.extensions import db


class ToolkitPreference(db.Model):
    """User preferences for mobile toolkit features."""
    __tablename__ = 'toolkit_preferences'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)

    # Worker toolkit
    simple_mode_enabled = db.Column(db.Boolean, default=False)
    fab_enabled = db.Column(db.Boolean, default=True)
    fab_position = db.Column(db.String(20), default='bottom-right')  # bottom-right, bottom-left, bottom-center
    persistent_notification = db.Column(db.Boolean, default=True)
    voice_commands_enabled = db.Column(db.Boolean, default=False)
    voice_language = db.Column(db.String(5), default='en')  # en, ar
    shake_to_pause = db.Column(db.Boolean, default=False)
    nfc_enabled = db.Column(db.Boolean, default=True)
    widget_enabled = db.Column(db.Boolean, default=True)
    smartwatch_enabled = db.Column(db.Boolean, default=False)

    # Inspector toolkit
    quick_camera_enabled = db.Column(db.Boolean, default=True)
    barcode_scanner_enabled = db.Column(db.Boolean, default=True)
    voice_checklist_enabled = db.Column(db.Boolean, default=False)
    auto_location_enabled = db.Column(db.Boolean, default=True)

    # Engineer toolkit
    team_map_enabled = db.Column(db.Boolean, default=False)
    voice_review_enabled = db.Column(db.Boolean, default=False)
    red_zone_alerts = db.Column(db.Boolean, default=True)

    # QE toolkit
    photo_compare_enabled = db.Column(db.Boolean, default=True)
    voice_rating_enabled = db.Column(db.Boolean, default=False)
    punch_list_enabled = db.Column(db.Boolean, default=True)

    # Admin toolkit
    morning_brief_enabled = db.Column(db.Boolean, default=True)
    kpi_alerts_enabled = db.Column(db.Boolean, default=True)
    emergency_broadcast = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'simple_mode_enabled': self.simple_mode_enabled,
            'fab_enabled': self.fab_enabled,
            'fab_position': self.fab_position,
            'persistent_notification': self.persistent_notification,
            'voice_commands_enabled': self.voice_commands_enabled,
            'voice_language': self.voice_language,
            'shake_to_pause': self.shake_to_pause,
            'nfc_enabled': self.nfc_enabled,
            'widget_enabled': self.widget_enabled,
            'smartwatch_enabled': self.smartwatch_enabled,
            'quick_camera_enabled': self.quick_camera_enabled,
            'barcode_scanner_enabled': self.barcode_scanner_enabled,
            'voice_checklist_enabled': self.voice_checklist_enabled,
            'auto_location_enabled': self.auto_location_enabled,
            'team_map_enabled': self.team_map_enabled,
            'voice_review_enabled': self.voice_review_enabled,
            'red_zone_alerts': self.red_zone_alerts,
            'photo_compare_enabled': self.photo_compare_enabled,
            'voice_rating_enabled': self.voice_rating_enabled,
            'punch_list_enabled': self.punch_list_enabled,
            'morning_brief_enabled': self.morning_brief_enabled,
            'kpi_alerts_enabled': self.kpi_alerts_enabled,
            'emergency_broadcast': self.emergency_broadcast,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
