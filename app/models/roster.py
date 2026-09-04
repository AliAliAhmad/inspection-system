"""
Team Roster model.
Tracks daily shift assignments for team members.
"""

from app.extensions import db
from datetime import datetime


class RosterEntry(db.Model):
    __tablename__ = 'roster_entries'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    shift = db.Column(db.String(20), nullable=True)  # 'day', 'night', 'off', 'leave'

    # WHERE this day came from, so an import can tell its own work from a
    # person's. Ali, 2026-09-04: "what i change in the app should be kept as
    # what my change is".
    #
    #   'import' -> written by the roster file. The import may replace these.
    #   'manual' -> a person set it in the app. NEVER replaced by an import.
    #   'swap'   -> written by an approved shift swap. Also a person's decision.
    #    NULL    -> a row from the old delete-and-recreate upload, before this
    #               existed. Treated as replaceable, which is exactly Ali's
    #               "the first apply lands as it is" — no special first-run flag
    #               is needed, because protection can only begin once something
    #               has been marked manual or swap, and that can only happen
    #               after the first import.
    source = db.Column(db.String(10), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User')

    __table_args__ = (
        db.UniqueConstraint('user_id', 'date', name='uq_roster_user_date'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'date': self.date.isoformat() if self.date else None,
            'shift': self.shift,
            'source': self.source,
            # What the roster screen should mark. Both are a person's decision.
            'changed_by_hand': self.source in ('manual', 'swap'),
        }
