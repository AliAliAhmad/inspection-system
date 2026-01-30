"""
Flask application factory.
Creates and configures the Flask app with all extensions.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from app.config import config
from app.extensions import db, migrate, jwt, limiter
from datetime import datetime
import os
import logging
from logging.handlers import RotatingFileHandler

def create_app(config_name='development'):
    """
    Application factory pattern.
    Creates and configures the Flask application.

    Args:
        config_name: Configuration name ('development', 'production', 'testing')

    Returns:
        Configured Flask application
    """
    app = Flask(__name__, instance_relative_config=True)

    # Load configuration
    config_class = config[config_name]
    app.config.from_object(config_class)

    # Validate required env vars for production
    required = getattr(config_class, 'REQUIRED_ENV_VARS', [])
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        raise RuntimeError(f"Missing required environment variables for {config_name}: {', '.join(missing)}")

    # Ensure instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    # Ensure upload folder exists
    upload_folder = app.config.get('UPLOAD_FOLDER', 'instance/uploads')
    os.makedirs(upload_folder, exist_ok=True)

    # Configure logging
    _setup_logging(app)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)

    # CORS configuration — production must set CORS_ORIGINS explicitly
    cors_origins = os.getenv('CORS_ORIGINS', '*')
    if cors_origins != '*':
        cors_origins = [o.strip() for o in cors_origins.split(',')]
    if cors_origins == '*' and not app.config.get('DEBUG') and not app.config.get('TESTING'):
        app.logger.warning("CORS_ORIGINS not set — defaulting to '*'. Set CORS_ORIGINS in production.")
    CORS(app, origins=cors_origins)

    # Import models to ensure they're registered
    with app.app_context():
        from app import models

    # Register blueprints
    from app.api import (
        auth, users, equipment, checklists, inspections, defects,
        reports, schedules, ratings, notifications, specialist_jobs,
        inspection_assignments, assessments, defect_assessments,
        quality_reviews, engineer_jobs, leaves, leaderboards, bonus_stars,
        files, sync, inspection_routines
    )

    # Core
    app.register_blueprint(auth.bp, url_prefix='/api/auth')
    app.register_blueprint(users.bp, url_prefix='/api/users')
    app.register_blueprint(equipment.bp, url_prefix='/api/equipment')
    app.register_blueprint(checklists.bp, url_prefix='/api/checklists')
    app.register_blueprint(inspections.bp, url_prefix='/api/inspections')
    app.register_blueprint(defects.bp, url_prefix='/api/defects')
    app.register_blueprint(reports.bp, url_prefix='/api/reports')
    app.register_blueprint(schedules.bp, url_prefix='/api/schedules')
    app.register_blueprint(ratings.bp, url_prefix='/api/ratings')
    app.register_blueprint(notifications.bp, url_prefix='/api/notifications')

    # Specialist & Engineer jobs
    app.register_blueprint(specialist_jobs.bp, url_prefix='/api/jobs')
    app.register_blueprint(engineer_jobs.bp, url_prefix='/api/engineer-jobs')

    # Inspection workflow
    app.register_blueprint(inspection_assignments.bp, url_prefix='/api/inspection-assignments')
    app.register_blueprint(assessments.bp, url_prefix='/api/assessments')

    # Defect assessment
    app.register_blueprint(defect_assessments.bp, url_prefix='/api/defect-assessments')

    # Quality reviews
    app.register_blueprint(quality_reviews.bp, url_prefix='/api/quality-reviews')

    # Leave management
    app.register_blueprint(leaves.bp, url_prefix='/api/leaves')

    # Leaderboards & Bonus
    app.register_blueprint(leaderboards.bp, url_prefix='/api/leaderboards')
    app.register_blueprint(bonus_stars.bp, url_prefix='/api/bonus-stars')

    # File management
    app.register_blueprint(files.bp, url_prefix='/api/files')

    # Inspection routines
    app.register_blueprint(inspection_routines.bp, url_prefix='/api/inspection-routines')

    # Offline sync
    app.register_blueprint(sync.bp, url_prefix='/api/sync')

    # Initialize background scheduler (not in testing)
    if config_name != 'testing':
        from app.services.scheduler_service import init_scheduler
        init_scheduler(app)

    # Register error handlers
    from app.exceptions.api_exceptions import APIException

    @app.errorhandler(APIException)
    def handle_api_exception(error):
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'status': 'error', 'message': 'Resource not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        import traceback
        app.logger.error(f'Internal server error: {error}\n{traceback.format_exc()}')
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

    @app.errorhandler(422)
    def unprocessable(error):
        return jsonify({'status': 'error', 'message': 'Unprocessable entity'}), 422

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({'status': 'error', 'message': 'Method not allowed'}), 405

    @app.errorhandler(429)
    def rate_limited(error):
        return jsonify({'status': 'error', 'message': 'Too many requests'}), 429

    # JWT error handlers
    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_payload):
        return jsonify({'status': 'error', 'message': 'Token has expired'}), 401

    @jwt.invalid_token_loader
    def invalid_token(error_string):
        return jsonify({'status': 'error', 'message': 'Invalid token'}), 401

    @jwt.unauthorized_loader
    def missing_token(error_string):
        return jsonify({'status': 'error', 'message': 'Authorization token required'}), 401

    @jwt.revoked_token_loader
    def revoked_token(jwt_header, jwt_payload):
        return jsonify({'status': 'error', 'message': 'Token has been revoked'}), 401

    @jwt.token_in_blocklist_loader
    def check_token_revoked(jwt_header, jwt_payload):
        from app.models import TokenBlocklist
        jti = jwt_payload['jti']
        return db.session.query(
            TokenBlocklist.query.filter_by(jti=jti).exists()
        ).scalar()

    # Public endpoints (no authentication required)
    @app.route('/')
    def index():
        """Root endpoint - returns API information."""
        return jsonify({
            'message': 'Industrial Inspection System API',
            'version': '2.0.0',
            'status': 'running',
            'endpoints': {
                'health': '/health',
                'auth': '/api/auth/login',
                'inspections': '/api/inspections',
                'inspection_assignments': '/api/inspection-assignments',
                'assessments': '/api/assessments',
                'defects': '/api/defects',
                'defect_assessments': '/api/defect-assessments',
                'specialist_jobs': '/api/jobs',
                'engineer_jobs': '/api/engineer-jobs',
                'quality_reviews': '/api/quality-reviews',
                'leaves': '/api/leaves',
                'leaderboards': '/api/leaderboards',
                'bonus_stars': '/api/bonus-stars',
                'reports': '/api/reports/dashboard',
                'files': '/api/files',
            }
        }), 200

    @app.route('/health')
    def health():
        """Health check endpoint - returns system status."""
        from sqlalchemy import text
        db_ok = False
        try:
            db.session.execute(text('SELECT 1'))
            db_ok = True
        except Exception:
            app.logger.warning("Health check: database unreachable")

        status_code = 200 if db_ok else 503
        return jsonify({
            'status': 'healthy' if db_ok else 'degraded',
            'version': '2.0.0',
            'database': 'connected' if db_ok else 'unreachable',
            'timestamp': datetime.utcnow().isoformat()
        }), status_code

    # CLI commands
    @app.cli.command('seed-admin')
    def seed_admin():
        """Create the initial admin user."""
        from werkzeug.security import generate_password_hash
        from app.models.user import User as UserModel
        user = UserModel.query.filter_by(email='admin@inspection.com').first()
        if user:
            print(f'Admin already exists (id={user.id})')
            return
        admin = UserModel(
            email='admin@inspection.com',
            password_hash=generate_password_hash('Admin1234'),
            full_name='System Admin',
            role='admin',
            role_id='ADM-001',
            is_active=True,
        )
        db.session.add(admin)
        db.session.commit()
        print(f'Admin user created (id={admin.id})')

    return app


def _setup_logging(app):
    """Configure application logging."""
    log_level = getattr(logging, app.config.get('LOG_LEVEL', 'INFO').upper(), logging.INFO)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
    ))
    app.logger.addHandler(console_handler)

    # File handler (production)
    if not app.config.get('TESTING'):
        log_file = app.config.get('LOG_FILE', 'instance/logs/app.log')
        log_dir = os.path.dirname(log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file, maxBytes=10 * 1024 * 1024, backupCount=5
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] %(name)s: %(message)s [%(pathname)s:%(lineno)d]'
        ))
        app.logger.addHandler(file_handler)

    app.logger.setLevel(log_level)
