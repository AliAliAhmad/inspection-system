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
def rate_limit_key():
    """WHO a request counts against: the logged-in person, else the real address.

    Ali, 2026-09-24: "some of the filters are not working, i do not know why ...
    shows error or nothing showing". This was get_remote_address, and on Render
    every request reaches the app through Render's proxy — with no ProxyFix, the
    remote address was the PROXY's for everybody. The whole company shared one
    bucket of 200 requests a minute (one gunicorn worker, memory storage), and
    login's "5 per minute" was 5 for the entire yard. A board that fires ~10
    queries on open plus a search box that sends one request per keystroke used it
    up, and then EVERY screen answered 429 "Too many requests" until the minute
    rolled over — to whoever happened to be clicking. Random, and blamed on the
    filter the person was touching.

    Keyed by user id when a valid token is present: every phone in the yard comes
    from ONE Wi-Fi address, so even the real IP would still pool the crew. Without
    a token (login, public routes) the real client address, which ProxyFix in
    create_app() now supplies.
    """
    from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
    # An access token, else a refresh token (POST /refresh carries one — without
    # this the whole yard's token refreshes shared one address bucket).
    for refresh in (False, True):
        try:
            verify_jwt_in_request(optional=True, refresh=refresh)
            identity = get_jwt_identity()
            if identity is not None:
                return f'user:{identity}'
        except Exception:
            # Expired, malformed or the other kind of token: the route itself
            # will refuse it. Never let the key function raise.
            continue
    return get_remote_address()


def login_rate_limit_key():
    """Login: the address AND the account being tried.

    The login limit exists to stop password guessing against an account. Keyed
    on the address alone it was one bucket for the whole yard — every phone
    there leaves through one Wi-Fi address — so five logins in a minute at shift
    start locked everybody else out. Per address+email, each account still gets
    its five tries, and a guesser still gets only five per account.
    """
    from flask import request
    email = ((request.get_json(silent=True) or {}).get('email')
             or (request.get_json(silent=True) or {}).get('username') or '')
    return f'login:{get_remote_address()}:{str(email).strip().lower()}'



limiter = Limiter(
    key_func=rate_limit_key,
    default_limits=["200 per minute"],
    storage_uri="memory://",
)

# SocketIO instance (initialized in app factory)
socketio = None


def init_socketio(app):
    """Initialize Flask-SocketIO for WebSocket support."""
    global socketio
    try:
        from flask_socketio import SocketIO
        socketio = SocketIO(
            app,
            cors_allowed_origins="*",
            async_mode='threading',
            logger=False,
            engineio_logger=False
        )
        logger.info("Flask-SocketIO initialized successfully")
        return socketio
    except ImportError:
        logger.warning("Flask-SocketIO not installed, WebSocket features disabled")
        return None


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