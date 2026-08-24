"""
Configuration classes for different environments.
"""

import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


class Config:
    """Base configuration."""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')

    # JWT Configuration
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)
    JWT_TOKEN_LOCATION = ['headers']
    JWT_HEADER_NAME = 'Authorization'
    JWT_HEADER_TYPE = 'Bearer'

    # Database
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # File uploads
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', os.path.join(basedir, 'instance', 'uploads'))
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file size (videos can be large)

    # Shared secret for the Windows SAP file courier. Machine-to-machine, kept
    # separate from the human JWT login. Unset means the sync endpoint refuses
    # everything rather than accepting anything.
    SAP_SYNC_ROBOT_KEY = os.getenv('SAP_SYNC_ROBOT_KEY', '')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'}

    # When a week ends, its UNFINISHED work returns to the box — Ali's rule,
    # never implemented, which is why ten finished weeks were still holding
    # 2,242 orders. Off by default: it deletes redundant rows in production and
    # the last unattended cleanup emptied the pool, so this one runs only after
    # its read-only classification has been looked at.
    # Enabled 2026-08-24 after the read-only classify() was checked against
    # production: 2,242 rows held by 10 finished weeks, 344 to release, 1,898
    # redundant duplicates, and ZERO with a worked job. That last number was
    # verified separately rather than trusted — the only 4 worked jobs in those
    # weeks are defect/manual jobs carrying no SAP order, so there is no staging
    # row for the rule to protect and "0" was honest.
    SAP_CARRY_OVER_ENABLED = os.getenv('SAP_CARRY_OVER_ENABLED', 'true').lower() == 'true'

    # --- Telegram planning bot -------------------------------------------------
    # Kill switch. False skips blueprint registration entirely, so a misbehaving
    # bot can be turned off with an env var and a restart rather than a deploy.
    TELEGRAM_ENABLED = os.getenv('TELEGRAM_ENABLED', 'true').lower() != 'false'

    # From BotFather. Absent means the bot cannot send anything, and the webhook
    # refuses every update — a missing token must never mean "open to all".
    TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')

    # Telegram echoes this back in X-Telegram-Bot-Api-Secret-Token on every
    # update, which is how we know a POST really came from Telegram.
    TELEGRAM_WEBHOOK_SECRET = os.getenv('TELEGRAM_WEBHOOK_SECRET', '')

    # "<telegram_user_id>:<app_user_id>,..." — one setting that does BOTH
    # authorization and identity. A sender not listed here is ignored in silence.
    TELEGRAM_ALLOWED_USERS = os.getenv('TELEGRAM_ALLOWED_USERS', '')

    # Rate limiting
    RATELIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'memory://')
    RATELIMIT_DEFAULT = '200 per minute'

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', os.path.join(basedir, 'instance', 'logs', 'app.log'))


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL', f'sqlite:///{os.path.join(basedir, "instance", "inspection.db")}'
    )
    LOG_LEVEL = 'DEBUG'


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False

    # Require explicit secrets — validated at startup via init_app
    SECRET_KEY = os.getenv('SECRET_KEY', '')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', '')

    # Fix Render/Heroku postgres:// URI for SQLAlchemy 2.x
    _db_url = os.getenv('DATABASE_URL', '')
    if _db_url.startswith('postgres://'):
        _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
    SQLALCHEMY_DATABASE_URI = _db_url

    # Security
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_COOKIE_SECURE = True

    # Rate limiting with Redis in production
    RATELIMIT_STORAGE_URI = os.getenv('REDIS_URL', 'memory://')

    # Database pool (for PostgreSQL/MySQL)
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': int(os.getenv('DB_POOL_SIZE', '10')),
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 5,
    }

    REQUIRED_ENV_VARS = ['SECRET_KEY', 'JWT_SECRET_KEY', 'DATABASE_URL']


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite://'  # in-memory
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    LOG_LEVEL = 'WARNING'
    RATELIMIT_ENABLED = False


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}