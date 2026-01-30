import logging

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

logger = logging.getLogger(__name__)

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per minute"],
    storage_uri="memory://",
)


def safe_commit():
    """Commit the current DB session with rollback on failure.

    Raises the original exception after rolling back so that the global
    error handler can return a proper response.
    """
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Database commit failed — rolled back")
        raise