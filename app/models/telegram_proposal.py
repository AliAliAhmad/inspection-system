"""A question the bot asked, and the phones it landed on.

The bot could only ever talk. A question is different: it has to WAIT, and
while it waits every planner's phone holds a copy of it. One finger decides;
the other copies must stop working. None of that is possible without
remembering what was asked and where it went.

Shaped after SapReconciliationEvent on purpose — the same `status` guarded by
a CHECK constraint, the same free-form `details` JSON, the same one-line
human-readable `summary`. That model was already the closest thing in this
codebase to an open question, and two different shapes for "something is
waiting for a person" would drift apart the first time either changed.
"""

from datetime import datetime

from app.extensions import db

KINDS = ('urgent_needs_room', 'crew_is_free')
STATUSES = ('open', 'accepted', 'declined', 'expired', 'failed')


class TelegramProposal(db.Model):
    """One question. One line in the notebook."""

    __tablename__ = 'telegram_proposals'

    id = db.Column(db.Integer, primary_key=True)

    # Which apply function runs when somebody says yes.
    kind = db.Column(db.String(40), nullable=False, index=True)

    # The one line a person reads without opening anything.
    summary = db.Column(db.Text, nullable=False)

    # Everything the apply step needs: order number, berth, wallet key,
    # man-hours, the simulated domino chain, the candidate list. Free-form on
    # purpose — the useful fields differ per kind and will keep changing.
    details = db.Column(db.JSON, nullable=True)

    # The buttons, in order. APPEND-ONLY: a button's callback_data carries its
    # POSITION in this list, and other phones are still displaying the old
    # positions. Renumbering would turn somebody else's "No" into "Tuesday".
    options = db.Column(db.JSON, nullable=False)

    work_plan_id = db.Column(db.Integer, db.ForeignKey('work_plans.id'),
                             nullable=True, index=True)
    target_day_id = db.Column(db.Integer, db.ForeignKey('work_plan_days.id'),
                              nullable=True)

    status = db.Column(db.String(20), nullable=False, default='open', index=True)
    decided_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    decided_option = db.Column(db.String(40), nullable=True)
    decided_at = db.Column(db.DateTime, nullable=True)

    # After this the buttons are dead. Indexed because the nightly sweep and
    # every single tap both filter on it.
    expires_at = db.Column(db.DateTime, nullable=False, index=True)

    # What actually happened — the real domino chain, the created job id, or
    # the error. The audit trail; nothing else records it.
    result = db.Column(db.JSON, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow,
                           nullable=False, index=True)

    messages = db.relationship('TelegramProposalMessage',
                               back_populates='proposal',
                               cascade='all, delete-orphan')
    decided_by = db.relationship('User')
    work_plan = db.relationship('WorkPlan')
    target_day = db.relationship('WorkPlanDay')

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('open', 'accepted', 'declined', 'expired', 'failed')",
            name='check_telegram_proposal_status'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'kind': self.kind,
            'summary': self.summary,
            'details': self.details or {},
            'options': self.options or [],
            'work_plan_id': self.work_plan_id,
            'target_day_id': self.target_day_id,
            'status': self.status,
            'decided_by_id': self.decided_by_id,
            'decided_option': self.decided_option,
            'decided_at': self.decided_at.isoformat() if self.decided_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'result': self.result,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class TelegramProposalMessage(db.Model):
    """One copy of the question, on one phone.

    Exists for exactly one reason: to grey out the other copies once somebody
    decides. `TelegramClient.send_message` already returns Telegram's result
    dict carrying `message_id` and no caller in this codebase has ever kept it.
    """

    __tablename__ = 'telegram_proposal_messages'

    id = db.Column(db.Integer, primary_key=True)
    proposal_id = db.Column(db.Integer, db.ForeignKey('telegram_proposals.id'),
                            nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    chat_id = db.Column(db.BigInteger, nullable=False)

    # Nullable: a send can fail. The question is still open for everybody else,
    # and this row records that this phone never got it.
    message_id = db.Column(db.BigInteger, nullable=True)

    # Stored so the later edit is written in the same language as the original.
    language = db.Column(db.String(2), nullable=False, default='en')

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    proposal = db.relationship('TelegramProposal', back_populates='messages')
    user = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'proposal_id': self.proposal_id,
            'user_id': self.user_id,
            'chat_id': self.chat_id,
            'message_id': self.message_id,
            'language': self.language,
        }
