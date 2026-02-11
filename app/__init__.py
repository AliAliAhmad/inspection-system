"""
Flask application factory.
Creates and configures the Flask app with all extensions.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from app.config import config
from app.extensions import db, migrate, jwt, limiter, init_socketio
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

    # CORS configuration — allow all origins in development
    CORS(app,
         resources={r"/api/*": {"origins": "*"}},
         supports_credentials=True,
         allow_headers=["*"],
         methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
         expose_headers=["Content-Type", "Authorization"])

    # Handle OPTIONS requests for CORS preflight
    @app.before_request
    def handle_preflight():
        if request.method == 'OPTIONS':
            response = jsonify({'status': 'ok'})
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Accept-Language'
            response.headers['Access-Control-Max-Age'] = '3600'
            return response, 200

    # CORS + Security headers for all responses
    @app.after_request
    def add_response_headers(response):
        # CORS
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Accept-Language'
        # Security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(self), geolocation=()'

        # Content Security Policy
        # Note: unsafe-eval is needed for React DevTools and some build tools
        # unsafe-inline for styles is common in React apps
        csp_directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https: blob:",
            "font-src 'self' data:",
            "connect-src 'self' https:",
            "media-src 'self' https: blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
        response.headers['Content-Security-Policy'] = '; '.join(csp_directives)

        # Remove server header
        response.headers.pop('Server', None)
        return response

    # Import models to ensure they're registered
    with app.app_context():
        from app import models

    # Register blueprints
    from app.api import (
        auth, users, equipment, checklists, inspections, defects,
        reports, schedules, ratings, notifications, specialist_jobs,
        inspection_assignments, assessments, defect_assessments,
        quality_reviews, engineer_jobs, leaves, leaderboards, bonus_stars,
        files, sync, inspection_routines, roster, voice, ai,
        work_plans, materials, cycles, pm_templates, work_plan_tracking,
        approvals, auto_approvals, unified_ai,
        # AI-Enhanced Modules
        defect_ai, overdue, daily_review_ai, performance, schedule_ai,
        # Admin Audit
        admin_activity
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

    # Team Roster
    app.register_blueprint(roster.bp, url_prefix='/api/roster')

    # Leaderboards & Bonus
    app.register_blueprint(leaderboards.bp, url_prefix='/api/leaderboards')
    app.register_blueprint(bonus_stars.bp, url_prefix='/api/bonus-stars')

    # File management
    app.register_blueprint(files.bp, url_prefix='/api/files')

    # Inspection routines
    app.register_blueprint(inspection_routines.bp, url_prefix='/api/inspection-routines')

    # Offline sync
    app.register_blueprint(sync.bp, url_prefix='/api/sync')

    # Voice transcription & translation
    app.register_blueprint(voice.bp, url_prefix='/api/voice')

    # AI services (OpenAI - Vision, Reports, Search, TTS, Assistant)
    app.register_blueprint(ai.bp, url_prefix='/api/ai')

    # Work Planning
    app.register_blueprint(work_plans.bp, url_prefix='/api/work-plans')
    app.register_blueprint(materials.bp, url_prefix='/api/materials')
    app.register_blueprint(cycles.bp, url_prefix='/api/cycles')
    app.register_blueprint(pm_templates.bp, url_prefix='/api/pm-templates')

    # Work Plan Tracking & Performance
    app.register_blueprint(work_plan_tracking.bp, url_prefix='/api/work-plan-tracking')

    # Unified Approvals
    app.register_blueprint(approvals.bp, url_prefix='/api/approvals')

    # Auto-Approval AI Service
    app.register_blueprint(auto_approvals.bp, url_prefix='/api/auto-approvals')

    # Unified AI Services (Approvals, Quality Reviews, Inspection Routines)
    app.register_blueprint(unified_ai.bp, url_prefix='/api/ai')

    # AI-Enhanced Modules
    app.register_blueprint(defect_ai.bp, url_prefix='/api/defects')
    app.register_blueprint(overdue.bp, url_prefix='/api/overdue')
    app.register_blueprint(daily_review_ai.bp, url_prefix='/api/work-plan-tracking')
    app.register_blueprint(performance.bp, url_prefix='/api/performance')
    app.register_blueprint(schedule_ai.bp, url_prefix='/api/schedule-ai')

    # Admin Audit Trail
    app.register_blueprint(admin_activity.bp, url_prefix='/api/admin-activity')

    # Initialize Flask-SocketIO for WebSocket support
    socketio = init_socketio(app)
    if socketio:
        try:
            from app.api.notifications_ws import register_socketio_handlers
            register_socketio_handlers(socketio)
            app.logger.info("WebSocket handlers registered for notifications")
        except ImportError as e:
            app.logger.warning(f"Could not register WebSocket handlers: {e}")
        except Exception as e:
            app.logger.error(f"Error registering WebSocket handlers: {e}")

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

    @app.cli.command('reset-data')
    def reset_data():
        """
        Reset all data in the database while keeping admin users.
        Deletes all test data and uploaded files from Cloudinary.
        Use with caution - this is irreversible!
        """
        import click
        import cloudinary
        import cloudinary.api
        from sqlalchemy import text

        # Confirm before proceeding
        if not click.confirm('\n⚠️  WARNING: This will DELETE ALL DATA except admin users.\n'
                            'This includes all equipment, inspections, defects, users, files, etc.\n'
                            'This action is IRREVERSIBLE!\n\n'
                            'Are you sure you want to continue?'):
            print('Aborted.')
            return

        print('\n🔄 Starting data reset...\n')

        # Import models for File query
        from app.models import User, File

        # Step 1: Delete files from Cloudinary
        print('📁 Deleting files from Cloudinary...')
        files = File.query.all()
        deleted_files = 0
        failed_files = 0

        if files:
            # Initialize Cloudinary
            cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
            api_key = os.getenv('CLOUDINARY_API_KEY')
            api_secret = os.getenv('CLOUDINARY_API_SECRET')

            if all([cloud_name, api_key, api_secret]):
                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret,
                    secure=True
                )

                for f in files:
                    public_id = f.stored_filename
                    if public_id and not public_id.startswith('/'):
                        try:
                            # Determine resource type
                            resource_type = 'image'
                            if f.mime_type:
                                if 'video' in f.mime_type or 'audio' in f.mime_type:
                                    resource_type = 'video'

                            cloudinary.uploader.destroy(public_id, resource_type=resource_type)
                            deleted_files += 1
                        except Exception as e:
                            failed_files += 1
                            print(f'  ⚠️  Failed to delete {public_id}: {e}')

                print(f'  ✓ Deleted {deleted_files} files from Cloudinary')
                if failed_files:
                    print(f'  ⚠️  Failed to delete {failed_files} files')
            else:
                print('  ⚠️  Cloudinary not configured, skipping cloud file deletion')
        else:
            print('  ✓ No files to delete')

        # Step 2: Save admin users before truncating
        print('\n👤 Saving admin users...')
        admins = User.query.filter_by(role='admin').all()
        admin_data = []
        for admin in admins:
            admin_data.append({
                'email': admin.email,
                'password_hash': admin.password_hash,
                'full_name': admin.full_name,
                'role': admin.role,
                'role_id': admin.role_id,
                'is_active': admin.is_active,
                'phone': admin.phone,
                'language': admin.language,
            })
        print(f'  ✓ Saved {len(admin_data)} admin user(s)')

        # Step 3: Truncate all tables using CASCADE (PostgreSQL)
        # This automatically handles foreign key constraints
        print('\n🗑️  Truncating all tables...')

        tables_to_truncate = [
            'notifications',
            'bonus_stars',
            'inspection_ratings',
            'quality_reviews',
            'defect_assessments',
            'final_assessments',
            'inspection_answers',
            'defect_occurrences',
            'pause_logs',
            'job_takeovers',
            'specialist_jobs',
            'engineer_jobs',
            'defects',
            'inspections',
            'inspection_assignments',
            'weekly_completions',
            'inspection_schedules',
            'inspection_routines',
            'inspection_lists',
            'checklist_items',
            'checklist_templates',
            'equipment_status_logs',
            'equipment',
            'roster_entries',
            'leaves',
            'role_swap_logs',
            'import_logs',
            'sync_queue',
            'translations',
            'token_blocklist',
            'files',
            'users',
        ]

        try:
            # Use TRUNCATE with CASCADE for all tables at once
            tables_str = ', '.join(tables_to_truncate)
            db.session.execute(text(f'TRUNCATE TABLE {tables_str} RESTART IDENTITY CASCADE'))
            db.session.commit()
            print(f'  ✓ Truncated {len(tables_to_truncate)} tables')
        except Exception as e:
            db.session.rollback()
            print(f'  ⚠️  Error truncating tables: {e}')
            return

        # Step 4: Restore admin users
        print('\n👤 Restoring admin users...')
        for data in admin_data:
            admin = User(
                email=data['email'],
                password_hash=data['password_hash'],
                full_name=data['full_name'],
                role=data['role'],
                role_id=data['role_id'],
                is_active=data['is_active'],
                phone=data.get('phone'),
                language=data.get('language', 'en'),
            )
            db.session.add(admin)

        try:
            db.session.commit()
            print(f'  ✓ Restored {len(admin_data)} admin user(s)')
        except Exception as e:
            db.session.rollback()
            print(f'  ⚠️  Error restoring admins: {e}')
            # Create default admin if restore failed
            from werkzeug.security import generate_password_hash
            admin = User(
                email='admin@inspection.com',
                password_hash=generate_password_hash('Admin1234'),
                full_name='System Admin',
                role='admin',
                role_id='ADM-001',
                is_active=True,
            )
            db.session.add(admin)
            db.session.commit()
            print('  ✓ Created default admin: admin@inspection.com / Admin1234')

        # Show final status
        admins = User.query.filter_by(role='admin').all()
        print(f'\n✅ Reset complete! Admin user(s):')
        for admin in admins:
            print(f'   - {admin.full_name} ({admin.email})')

        print('\n🎉 Database is now clean and ready for fresh data!')

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
