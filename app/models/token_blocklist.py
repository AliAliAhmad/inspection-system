"""
JWT Token Blocklist model.
Stores revoked JWT token identifiers (jti) to prevent reuse after logout.
"""

from app.extensions import db
from datetime import datetime


class TokenBlocklist(db.Model):
    """Revoked JWT tokens."""
    __tablename__ = 'token_blocklist'

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    token_type = db.Column(db.String(10), nullable=False)  # 'access' or 'refresh'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    revoked_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    def __repr__(self):
        return f'<TokenBlocklist {self.jti}>'
