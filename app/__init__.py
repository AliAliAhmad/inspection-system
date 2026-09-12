"""
Flask application factory.
Creates and configures the Flask app with all extensions.
"""

import click
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

    # CORS configuration — use allowed origins from env or defaults
    allowed_origins = os.getenv('CORS_ORIGINS', '').split(',') if os.getenv('CORS_ORIGINS') else [
        'https://inspection-web.onrender.com',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8081',
        'exp://*',
    ]
    allowed_origins = [o.strip() for o in allowed_origins if o.strip()]
    CORS(app,
         resources={r"/api/*": {"origins": allowed_origins}},
         supports_credentials=True,
         allow_headers=["Content-Type", "Authorization", "Accept", "Accept-Language"],
         methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
         expose_headers=["Content-Type", "Authorization"])

    # Handle OPTIONS requests for CORS preflight
    @app.before_request
    def handle_preflight():
        if request.method == 'OPTIONS':
            origin = request.headers.get('Origin', '')
            response = jsonify({'status': 'ok'})
            if origin in allowed_origins:
                response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Accept-Language'
            response.headers['Access-Control-Max-Age'] = '3600'
            return response, 200

    # CORS + Security headers for all responses
    @app.after_request
    def add_response_headers(response):
        # CORS — set origin dynamically based on request
        origin = request.headers.get('Origin', '')
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
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
        admin_activity,
        # Team Communication & Toolkit
        team_communication, toolkit,
        # Translation
        translations,
        # Previous Inspection (Photo Compare, Copy from Previous)
        previous_inspection,
        # Running Hours & Service Tracking
        running_hours,
        # Answer Templates
        answer_templates,
        # Job Show Up & Challenges
        job_showup,
        # Shift Handover
        shift_handover,
        # Monitor Follow-Up
        monitor_followups,
        # Quick Field Reports
        quick_reports,
        # Unplanned Jobs
        unplanned_jobs,
        # Smart Plan Generator — Worker Assignment Rules
        worker_assignment_rules,
        # Data Cleanup (admin tooling — red-tenths typo correction etc.)
        data_cleanup,
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
    from app.api import sap_sync
    app.register_blueprint(sap_sync.bp, url_prefix='/api/sap-sync')

    # Kill switch: TELEGRAM_ENABLED=false and the routes do not exist at all,
    # so a misbehaving bot is turned off with an env var and a restart.
    if app.config.get('TELEGRAM_ENABLED'):
        from app.api import telegram as telegram_api
        app.register_blueprint(telegram_api.bp, url_prefix='/api/telegram')
    app.register_blueprint(materials.bp, url_prefix='/api/materials')
    app.register_blueprint(cycles.bp, url_prefix='/api/cycles')
    app.register_blueprint(pm_templates.bp, url_prefix='/api/pm-templates')
    app.register_blueprint(worker_assignment_rules.bp)  # Has its own url_prefix

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

    # Team Communication & Mobile Toolkit
    app.register_blueprint(team_communication.bp, url_prefix='/api/communication')
    app.register_blueprint(toolkit.bp, url_prefix='/api/toolkit')

    # Translation
    app.register_blueprint(translations.bp)

    # Running Hours & Service Tracking
    app.register_blueprint(running_hours.bp, url_prefix='/api/equipment')

    # Answer Templates
    app.register_blueprint(answer_templates.bp, url_prefix='/api/answer-templates')

    # Job Show Up & Challenges
    app.register_blueprint(job_showup.bp, url_prefix='/api/job-showup')

    # Shift Handover
    app.register_blueprint(shift_handover.bp)

    # Monitor Follow-Up
    app.register_blueprint(monitor_followups.bp, url_prefix='/api/monitor-followups')

    # Quick Field Reports
    app.register_blueprint(quick_reports.bp, url_prefix='/api/quick-reports')

    # Unplanned Jobs
    app.register_blueprint(unplanned_jobs.bp, url_prefix='/api/unplanned-jobs')

    # Data Cleanup (admin tooling)
    app.register_blueprint(data_cleanup.bp, url_prefix='/api/admin/cleanup')

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
    @app.cli.command('import-roster')
    @click.option('--apply', 'do_apply', is_flag=True,
                  help='Write the roster. Without this nothing is changed.')
    def import_roster(do_apply):
        """Read the team roster out of the delivered engineering workbook.

        Prints what it would do and stops. Add --apply to write.

        Never overwrites a day somebody set in the app: Ali, 2026-09-04, "what i
        change in the app should be kept as what my change is".
        """
        from app.services.roster_import import apply_roster
        from app.services.sap_pool_sync import _current_file_bytes

        payload, record = _current_file_bytes(filename_contains='Engineering 2026_v1')
        if not payload:
            print('No engineering workbook has been delivered.')
            return

        print('=' * 78)
        print(f'ROSTER from {record.source_filename}  (delivered {record.received_at})')
        print('=' * 78)

        report = apply_roster(payload, dry_run=not do_apply)
        print(f"  people in the sheet : {report['people_in_sheet']}")
        print(f"  matched in the app  : {report['matched_people']}")
        print(f"  dropped (no SAP id) : {report['dropped_people']}")
        if report['dropped_sap_ids']:
            print(f"      {', '.join(report['dropped_sap_ids'][:20])}"
                  + (' ...' if report['dropped_people'] > 20 else ''))
        print(f"  date columns        : {report['date_columns']}")
        print(f"  days created        : {report['created']}")
        print(f"  days updated        : {report['updated']}")
        print(f"  days left alone     : {report['left_alone_manual']}  "
              f"(changed by hand in the app)")
        if report['unknown_codes']:
            # A new code in the sheet must be visible, never silently skipped —
            # the workbook's own Instruction sheet is the authority.
            print(f"  UNKNOWN codes       : {report['unknown_codes']}")
            print('      not imported. Check the Instruction sheet and tell me '
                  'what they mean.')

        if not do_apply:
            print('\nDRY RUN — re-run with --apply to write.')

    @app.cli.command('pool-status')
    @click.option('--new', 'how_many', default=15, show_default=True,
                  help='How many of the most recently added orders to list.')
    def pool_status(how_many):
        """What is in the job pool, and what the last rebuild did.

        Exists because the two ways to answer "which orders came in?" both fail
        on their own: TablePlus needs a working laptop connection, and the
        Telegram /pool command needs a bot that is currently silent. This needs
        only the Render shell, which is where you end up anyway.
        """
        from app.models import Equipment, SAPWorkOrder
        from app.services.sap_pool_sync import load_last_report

        box = SAPWorkOrder.query.filter(
            SAPWorkOrder.work_plan_id.is_(None),
            SAPWorkOrder.status == 'pending',
        )
        print('=' * 78)
        print(f'JOB POOL: {box.count()} orders waiting')
        print('=' * 78)

        by_type = dict(db.session.query(SAPWorkOrder.job_type, db.func.count())
                       .filter(SAPWorkOrder.work_plan_id.is_(None),
                               SAPWorkOrder.status == 'pending')
                       .group_by(SAPWorkOrder.job_type).all())
        if by_type:
            print('  by type: ' + ' · '.join(f'{k} {v}' for k, v in sorted(by_type.items())))

        # Ordered by when they ARRIVED, not by required_date. The planner sorts
        # by due date, which puts a brand-new order at the BOTTOM of a hundred-row
        # list — the single most common reason a new order looks missing.
        print()
        print(f'--- the {how_many} most recently added ---')
        recent = (box.order_by(SAPWorkOrder.created_at.desc())
                  .limit(how_many).all())
        if not recent:
            print('  (none)')
        for order in recent:
            machine = db.session.get(Equipment, order.equipment_id)
            print(f"  {str(order.created_at)[:16]}  {order.order_number}  "
                  f"{(order.order_type or '?'):4}  "
                  f"{(machine.name if machine else '?'):8}  "
                  f"due {order.required_date or '-'}  "
                  f"{(order.description or '')[:44]}")

        report = load_last_report()
        print()
        print('--- last rebuild ---')
        if not report:
            print('  never run')
            return
        print(f"  at        : {report.get('written_at')}  ({report.get('status')})")
        if report.get('status') != 'ok':
            print(f"  reason    : {report.get('reason')}")
            return
        print(f"  source    : {report.get('source_file')} "
              f"received {report.get('source_received_at')}")
        # WHICH FILES LANDED. The operations live in IW49, so "no operations"
        # and "no IW49" look identical from the outside and need telling apart
        # before anybody goes looking for a bug in the parser.
        inputs = report.get('inputs') or {}
        if inputs:
            print('  files     : ' + ' · '.join(
                f"{name}={'yes' if present else 'NO'}"
                for name, present in inputs.items()))
        print(f"  candidates: {report.get('candidates')}")
        print(f"    created : {report.get('created')}")
        print(f"    updated : {report.get('updated')}")
        print(f"    on plans: {report.get('left_alone_because_scheduled')}")
        print(f"    DROPPED : {report.get('orders_skipped_no_equipment')} "
              f"(machine not in the app)")
        for code, count in (report.get('orders_skipped_by_code') or {}).items():
            print(f'        {code}: {count} orders lost')
        retired = report.get('retired_codes') or []
        if retired:
            print(f"    retired : {report.get('orders_skipped_retired')} on "
                  f"{', '.join(retired)} (sold — skipped on purpose)")

        # The operations inside each order, and — when the layout is not
        # recognised — the real IW49 column names, so the guessing can end
        # without a second command.
        ops = report.get('operations') or {}
        print()
        print('--- operations inside the orders (IW49) ---')
        if not ops:
            print('  nothing reported (this report predates the feature)')
        elif not ops.get('usable'):
            print('  NOT IMPORTED: ' + str(ops.get('reason')
                                           or 'IW49 columns not recognised'))
            matched = ops.get('matched') or {}
            for field, hit in matched.items():
                print(f"    {field:<12} -> {hit or 'NOT FOUND'}")
            headers = ops.get('headers') or []
            if headers:
                print(f'  the file actually has {len(headers)} columns:')
                for header in headers:
                    print(f'    {header}')
                print('  Add the real names to OPERATION_COLUMN_CANDIDATES in')
                print('  app/services/sap_order_parser.py')
        else:
            stored = ops.get('stored') or {}
            print(f"  read      : {ops.get('operations')} operations on "
                  f"{ops.get('orders')} orders ({ops.get('rows')} rows)")
            print(f"    waiting : {ops.get('waiting_on_material')} on material (PR)")
            print(f"    stored  : {stored.get('orders')} orders the app knows, "
                  f"{stored.get('skipped_unknown_orders')} skipped")
            print(f"    trade   : {stored.get('trade_labels_set', 0)} rows given "
                  f"a trade from their operations (filled or widened to ELME)")
            _print_pool_coverage(ops)
            print(f"    added   : {stored.get('added')}")
            print(f"    updated : {stored.get('updated')}")
            print(f"    removed : {stored.get('removed')} (untouched, gone from SAP)")
            print(f"    KEPT    : {stored.get('kept_but_gone_from_sap')} "
                  f"(work was done on them — flagged, not deleted)")

    @app.cli.command('translate-phrases')
    @click.option('--apply', 'do_apply', is_flag=True,
                  help='Actually translate. Without it, only reports.')
    @click.option('--limit', default=50, show_default=True,
                  help='How many phrases to translate in one run.')
    @click.option('--all', 'do_all', is_flag=True,
                  help='Keep going until every phrase is done.')
    def translate_phrases(do_apply, limit, do_all):
        """Fill the Arabic phrase store, and say how big the vocabulary is.

        Job descriptions used to be translated on every request through a chain
        of AI providers that is mostly down, so the same job read differently
        each time it was opened. They are translated ONCE here and remembered.

        Run it with no flags first: it counts the distinct phrases in the yard
        and shows what is still missing, without calling anything.
        """
        from app.models import SAPWorkOrder, WorkPlanJob
        from app.services.phrase_translation import (
            PhraseTranslation, normalise, remember, MAX_PHRASE_LENGTH)

        # Every description a worker could be shown, from both the pool and the
        # plans, counted by its normalised form.
        seen = {}
        for source in (db.session.query(SAPWorkOrder.description),
                       db.session.query(WorkPlanJob.description)):
            for (text,) in source:
                key = normalise(text)
                if key and len(key) <= MAX_PHRASE_LENGTH:
                    seen.setdefault(key, text)

        known = {r.source_key: r for r in PhraseTranslation.query.all()}
        done = {k: r for k, r in known.items() if r.ar_text}
        missing = [(k, t) for k, t in seen.items() if k not in done]

        print('=' * 78)
        print('ARABIC PHRASE STORE')
        print('=' * 78)
        print(f'  distinct phrases in the yard : {len(seen)}')
        print(f'  already translated           : {len(done)}')
        print(f'  reviewed by a person         : {sum(1 for r in known.values() if r.is_reviewed)}')
        print(f'  still English                : {len(missing)}')

        if not missing:
            print()
            print('  Nothing to do. Every phrase a worker can see has Arabic.')
            return

        # "i need those to be translated, any description" — --all means all.
        if do_all:
            limit = len(missing)

        print()
        print(f'--- the {min(limit, len(missing))} that would be translated next ---')
        for key, text in missing[:min(limit, 50)]:
            print(f'    {text[:70]}')
        if limit > 50:
            print(f'    ... and {limit - 50} more')

        if not do_apply:
            print()
            print('  Report only. Re-run with --apply to translate them.')
            print('  Nothing was called and nothing was written.')
            return

        from app.services.translation_service import TranslationService
        from app.services.phrase_translation import protect_terms, restore_terms
        ok = failed = 0
        print()
        print('--- translating ---')
        for key, text in missing[:limit]:
            # Hide the yard's own words first. Otherwise (PM) comes back as
            # 'مساءً' — in the evening — because a general translator has no way
            # to know it means Preventive Maintenance here. Same for AC, HYDR,
            # and every machine code.
            masked, protected = protect_terms(text)
            try:
                arabic = TranslationService.translate_to_arabic(masked)
                arabic = restore_terms(arabic, protected, arabic=True)
            except Exception as exc:  # noqa: BLE001
                arabic, exc_note = None, exc
                print(f'    FAILED  {text[:50]}  ({exc_note})')
            if arabic and arabic != text:
                remember(text, arabic)
                ok += 1
                print(f'    ok      {text[:44]}  ->  {arabic[:34]}')
            else:
                failed += 1
            # Commit as we go. A long --all run WILL meet a rate limit, and
            # everything translated before that point must survive it.
            if (ok + failed) % 10 == 0:
                db.session.commit()
        db.session.commit()

        print()
        print(f'  translated {ok}, failed {failed}')
        if failed:
            print()
            print('  A failure here is almost always a dead provider, not bad text.')
            print('  CLAUDE.md: Groq returns 401, OpenAI has no credits, Gemini is')
            print('  rate limited, and TOGETHER_API_KEY is ready but not yet set on')
            print('  Render. Add one working key and re-run; nothing else changes.')
        print()
        print('  Anything still English simply shows in English. No screen breaks.')

    @app.cli.command('fix-phrase')
    @click.argument('english')
    @click.argument('arabic')
    def fix_phrase(english, arabic):
        """Correct one phrase's Arabic, permanently.

        Marks it REVIEWED, which means no translation run will ever touch it
        again. This is how the yard's own words get into the app: a machine has
        no idea that a Fifth Wheel bush is a جلبة and not a garden shrub, and it
        will keep guessing wrong every time it is asked.

            flask fix-phrase "Fifth Wheel bushes" "جلب العجلة الخامسة"

        The English must be the phrase as SAP sends it — run review-phrases to
        see them exactly. Spacing and capitalisation do not matter.
        """
        from app.models import PhraseTranslation
        from app.services.phrase_translation import normalise, remember

        key = normalise(english)
        before = PhraseTranslation.query.filter_by(source_key=key).first()

        print('=' * 78)
        print(f'  english : {english}')
        if before and before.ar_text:
            print(f'  was     : {before.ar_text}')
        print(f'  now     : {arabic}')
        print('=' * 78)

        row = remember(english, arabic, reviewed=True)
        if row is None:
            print('  REFUSED. The phrase is longer than the store accepts.')
            return
        db.session.commit()
        print('  Saved and marked reviewed. No translation run will change it.')
        if not before:
            print()
            print('  Note: that phrase was not in the store yet, so it has been')
            print('  added. If SAP spells it differently the app will not match')
            print('  it — check with review-phrases.')

    @app.cli.command('review-phrases')
    @click.option('--suspect', 'only_suspect', is_flag=True,
                  help='Only phrases whose Arabic looks wrong.')
    @click.option('--forget', 'forget_suspect', is_flag=True,
                  help='Delete the suspect ones so they translate again.')
    @click.option('--limit', default=40, show_default=True)
    def review_phrases(only_suspect, forget_suspect, limit):
        """Read the Arabic phrase store, and throw out the bad answers.

        On 2026-09-09 a starved gemini-2.5-flash returned fragments — 'AC Issue'
        became 'مشكلة تكي', cut mid-word — and they were stored looking exactly
        like real translations. The provider is fixed and remember() now refuses
        obvious wreckage, but rows written before that are still sitting there,
        and a wrong phrase is invisible: it reads as Arabic, so nobody checks.

        --suspect lists the ones worth a human eye. --forget deletes them, so
        the next `translate-phrases --apply` does them again properly. A phrase
        marked reviewed is never touched.
        """
        from app.models import PhraseTranslation
        from app.services.phrase_translation import looks_truncated

        rows = PhraseTranslation.query.order_by(PhraseTranslation.id).all()
        done = [r for r in rows if r.ar_text]
        suspect = [r for r in done
                   if not r.is_reviewed and looks_truncated(r.source_text, r.ar_text)]

        print('=' * 78)
        print('ARABIC PHRASE STORE')
        print('=' * 78)
        print(f'  stored              : {len(rows)}')
        print(f'  with Arabic         : {len(done)}')
        print(f'  reviewed by a person: {sum(1 for r in rows if r.is_reviewed)}')
        print(f'  look wrong          : {len(suspect)}')

        # Phrases whose Arabic contains a word the yard's own vocabulary should
        # have kept out of it. 'مساء' is the evening — it is (PM) mistranslated,
        # every time. These were stored before terms were protected.
        from app.services.phrase_translation import protect_terms
        # Words a general translator reaches for that are wrong in a workshop.
        # Every one of these was produced on Ali's real vocabulary:
        #   شجيرات   garden shrubs, for a bush (جلبة)
        #   الإرسال  broadcasting, for the gearbox (ناقل الحركة)
        #   قضية     a legal case, for a fault
        #   ارتداء   wearing clothes, for worn out
        #   مساء     the evening, for (PM)
        #   التيار المتردد  alternating current, for air conditioning
        WRONG_MEANINGS = ('مساء', 'التيار المتردد', 'شجيرات', 'الإرسال',
                          'قضية', 'ارتداء', 'الربيع', 'شحوب')
        spoiled = [r for r in done
                   if not r.is_reviewed and r.ar_text
                   and any(w in r.ar_text for w in WRONG_MEANINGS)]
        print(f'  reads wrong to a fitter: {len(spoiled)}')
        if spoiled:
            print('    -> these need YOUR words, not another provider.')
            print('       flask fix-phrase \"<english>\" \"<arabic>\"')
        # Anything protected is worth redoing, since it was translated blind.
        suspect = suspect + [r for r in spoiled if r not in suspect]

        show = suspect if only_suspect or forget_suspect else done
        if not show:
            print()
            print('  Nothing to show.')
            return

        print()
        print(f'--- {min(limit, len(show))} of {len(show)} ---')
        for r in show[:limit]:
            mark = 'SUSPECT' if r in suspect else '   ok  '
            print(f'  {mark}  {r.source_text[:44].ljust(44)}  ->  {(r.ar_text or "")[:30]}')

        if forget_suspect:
            for r in suspect:
                db.session.delete(r)
            db.session.commit()
            print()
            print(f'  Deleted {len(suspect)}. Run `flask translate-phrases --apply`')
            print('  to do them again, now that the provider is fixed.')
        elif not only_suspect:
            print()
            print('  --suspect shows only the doubtful ones, --forget deletes them.')

    @app.cli.command('why-no-plan')
    @click.argument('who')
    @click.option('--date', 'on_date', default=None,
                  help='Which day to check. Defaults to the planning day.')
    def why_no_plan(who, on_date):
        """Why does this person see nothing in My Work Plan?

        WHO is a name, a SAP id, a role id or an email — anything that
        identifies one person.

        Built for the same reason as pool-status: when a man says "my plan is
        empty" the answer is one of four things, and every one of them is
        invisible from the app itself. This walks the exact conditions
        /my-plan applies, in order, and stops at the first one that fails.
        """
        from datetime import datetime
        from app.models import User, WorkPlan, WorkPlanDay, WorkPlanJob, WorkPlanAssignment
        from app.utils.decorators import planning_today

        needle = (who or '').strip()
        if not needle:
            print('Give me a name, SAP id, role id or email.')
            return

        # Every way a person is identified in this app, and all of them
        # case-insensitively. The first version of this command compared
        # sap_id and role_id with `==`, and searched neither username nor
        # minor_role_id — so Ali looked for a real employee by his real
        # employee id, `spc-011`, and was told nobody matched, because the
        # column holds `SPC-011`. The screen calls role_id "employee id";
        # both spellings are searched here so either works.
        like = f'%{needle}%'
        exact = needle.lower()
        people = User.query.filter(
            db.or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                User.username.ilike(like),
                db.func.lower(User.sap_id) == exact,
                db.func.lower(User.role_id) == exact,
                db.func.lower(User.minor_role_id) == exact,
            )
        ).all()

        # Still nothing? A name is usually right but spelled differently —
        # "Ali Jameel Haidar" against "Ali J. Hayder". Match on any single word
        # and OFFER the candidates rather than declaring the man missing.
        suggestions = []
        if not people:
            words = [w for w in needle.replace('.', ' ').split() if len(w) > 2]
            if words:
                suggestions = User.query.filter(
                    db.or_(*[User.full_name.ilike(f'%{w}%') for w in words])
                ).limit(15).all()

        print('=' * 78)
        if not people:
            print(f'NOBODY MATCHES {needle!r}')
            print('=' * 78)
            if suggestions:
                print('  Did you mean one of these? (matched on part of the name)')
                for p in suggestions:
                    print(f'    {p.full_name:28}  user={p.username or "-":12} '
                          f'emp={p.role_id or "-":10} sap={p.sap_id or "-"}')
                print()
                print('  Run it again with the employee id or username above.')
            else:
                print('  Not one person matched any part of that. A worker who is not')
                print('  in the app cannot be assigned to anything, so his plan will')
                print('  always be empty.')
            print()
            print('  Searched: full name, email, username, SAP id, employee id.')
            return
        if len(people) > 1:
            print(f'{len(people)} people match {needle!r} — be more specific:')
            print('=' * 78)
            for p in people:
                print(f'  {p.full_name}   sap={p.sap_id or "-"}  '
                      f'role_id={p.role_id or "-"}  {p.email}')
            return

        person = people[0]
        day = (datetime.strptime(on_date, '%Y-%m-%d').date()
               if on_date else planning_today())
        print(f'{person.full_name}  ({person.role}, sap={person.sap_id or "-"})')
        print(f'checking {day}')
        print('=' * 78)

        if not person.is_active:
            print('STOP: this account is switched off. Nothing will show.')
            return

        # 1. Is there a plan covering that day at all?
        covering = (WorkPlan.query
                    .filter(WorkPlan.week_start <= day, WorkPlan.week_end >= day)
                    .order_by(WorkPlan.week_start.desc()).all())
        if not covering:
            print('STOP: no work plan exists whose week contains this day.')
            print('      Nobody sees anything, not just this person.')
            return
        for plan in covering:
            print(f'  plan #{plan.id}  {plan.week_start} .. {plan.week_end}  '
                  f'[{plan.status}]')

        # 2. /my-plan only ever matches a PUBLISHED plan.
        published = [p for p in covering if p.status == 'published']
        if not published:
            print()
            print('STOP: the plan covering this day is still a DRAFT.')
            print('      /my-plan matches published plans only, so EVERY worker')
            print('      sees an empty week until you press Publish.')
            return
        plan = published[0]

        # 3. Is there anything on that day?
        wp_day = WorkPlanDay.query.filter_by(work_plan_id=plan.id, date=day).first()
        if not wp_day:
            print()
            print(f'STOP: plan #{plan.id} has no row for {day}.')
            return
        jobs = WorkPlanJob.query.filter_by(work_plan_day_id=wp_day.id).all()
        print()
        print(f'  {day} holds {len(jobs)} job(s) in plan #{plan.id}')
        if not jobs:
            print()
            print('STOP: that day is empty for everyone.')
            return

        # 4. Is this person on any of them? This is the usual answer.
        mine = [j for j in jobs
                if any(a.user_id == person.id for a in (j.assignments or []))]
        print(f'  {person.full_name} is on {len(mine)} of them')
        if not mine:
            print()
            print('STOP: he is not assigned to any job on this day.')
            print('      A published plan shows a worker HIS jobs and nothing')
            print('      else, so an unstaffed day looks identical to no plan.')
            staffed = sorted({a.user.full_name
                              for j in jobs for a in (j.assignments or [])
                              if a.user})
            print(f'      Assigned that day: {", ".join(staffed) if staffed else "NOBODY"}')
            if not staffed:
                print('      -> not one job on this day has a team. That is the bug')
                print('         to chase, and it is not about this person.')
            return

        print()
        print('  HE SHOULD SEE THESE:')
        for j in mine:
            eq = j.equipment.name if j.equipment else '?'
            print(f'    job #{j.id}  {eq}  {(j.description or "")[:44]}')
        print()
        print('If the phone still shows nothing, it is the app and not the data:')
        print('  * the phone caches the week — pull down to refresh')
        print('  * check the date it is showing; the yard is UTC+3 and the')
        print('    server is UTC, so around midnight they disagree')

    @app.cli.command('add-missing-equipment')
    @click.option('--apply', 'do_apply', is_flag=True,
                  help='Write the row. Without this nothing is changed.')
    def add_missing_equipment(do_apply):
        """Add machines SAP writes orders for that the app does not have.

        A machine missing from `equipment` makes the pool sync drop EVERY order
        on it, silently — 38 orders across four codes on 2026-09-02. This adds
        the ones Ali has confirmed are real.

        Idempotent: matches on serial_number, so re-running changes nothing.
        Prints what it would do and stops. Add --apply to write.
        """
        from app.models import Equipment

        # plant code -> (what it is, which existing machine to copy conventions
        # from). The type column is derived from the name elsewhere in the app,
        # so it is READ off a real sibling rather than guessed here — otherwise
        # the order imports fine and then plans as an unknown category.
        WANTED = [
            {
                'code': 'RET01',
                'sibling_prefix': 'TT',
                # Ali, 2026-09-03: a terminal tractor that SAP codes RET, and it
                # moves between berths rather than living on one.
                'name_ar': 'RET01',
                'berth': None,
            },
        ]

        print('=' * 78)
        print('MACHINES MISSING FROM THE APP')
        print('=' * 78)

        to_create = []
        for want in WANTED:
            code = want['code']
            existing = Equipment.query.filter(
                (Equipment.serial_number == code) | (Equipment.name == code)
            ).first()
            if existing:
                print(f'  {code}: already present (id={existing.id}) — nothing to do')
                continue

            # Ali's convention (see _equipment_lookup): the equipment NAME
            # carries the plant code and serial_number carries the manufacturer
            # serial — so a sibling has to be found by either, not by serial
            # alone. Searching serial only found nothing and refused to create.
            prefix = f"{want['sibling_prefix']}%"
            sibling = Equipment.query.filter(
                (Equipment.name.like(prefix)) | (Equipment.serial_number.like(prefix))
            ).order_by(Equipment.id).first()
            if not sibling:
                print(f"  {code}: SKIPPED — no {want['sibling_prefix']}* machine to "
                      f'copy the type conventions from')
                continue

            to_create.append((want, sibling))
            print(f'  {code}: WILL CREATE')
            print(f'     type          = {sibling.equipment_type} (copied from '
                  f'{sibling.serial_number})')
            print(f'     type_2        = {sibling.equipment_type_2}')
            print(f'     berth         = {want["berth"] or "(none — works both)"}')

        if not to_create:
            print('\nNothing to create.')
            return

        if not do_apply:
            print('\nDRY RUN — re-run with --apply to write.')
            return

        for want, sibling in to_create:
            db.session.add(Equipment(
                name=want['code'],
                name_ar=want['name_ar'],
                # name carries the plant code, per the convention above — that
                # is what the pool sync matches on and what the planner shows.
                # serial_number is nullable=False and UNIQUE, and the real
                # manufacturer serial is not known here, so the plant code
                # stands in. Worth correcting on the equipment screen once the
                # real serial is to hand; the match works off either column.
                serial_number=want['code'],
                equipment_type=sibling.equipment_type,
                equipment_type_2=sibling.equipment_type_2,
                equipment_type_ar=sibling.equipment_type_ar,
                # NULL, not 'both': the column is documented east/west only, and
                # the pool query already ORs `berth IS NULL` into both berths, so
                # a null berth is what "works either side" means here.
                berth=want['berth'],
                status='active',
            ))
        db.session.commit()
        print(f'\nCreated {len(to_create)}. Run the pool rebuild to import their orders.')

    @app.cli.command('seed-material-kits')
    @click.option('--apply', 'do_apply', is_flag=True,
                  help='Write the kits. Without this nothing is changed.')
    def seed_material_kits(do_apply):
        """Load the standard PM material kits from SAP history.

        Prints what it would do and stops. Add --apply to write.
        """
        from app.services.material_kit_seed import apply as apply_kits, plan
        report = plan()

        rules = report.get('rules', {})
        print('=' * 78)
        print('STANDARD PM MATERIAL KITS')
        for key, value in rules.items():
            print(f'  {key}: {value}')
        print('=' * 78)

        if report['materials_to_create']:
            print(f"\nMATERIALS TO CREATE ({len(report['materials_to_create'])}) "
                  f"— referenced by a kit but not yet in the app:")
            for m in report['materials_to_create']:
                print(f"    {m['code']:<16s} {m['name']:<34s} {m['unit']:<5s} {m['category']}")

        creates = [k for k in report['kits'] if k['action'] == 'create']
        updates = [k for k in report['kits'] if k['action'] == 'update']
        print(f"\nKITS: {len(creates)} to create, {len(updates)} to update, "
              f"{len(report['to_deactivate'])} to switch off")
        held = report['held_back']
        print(f"({len(held)} more held back — under 5 services, so a percentage "
              f"would mean nothing)")

        for entry in report['kits']:
            iv = f"{entry['interval_hours']} hr" if entry['interval_hours'] else 'hourly, no interval'
            head = (f"{entry['action'].upper():<7s} {entry['equipment_type']:<6s} "
                    f"{entry['equipment_model'] or '(any model)':<24s} {iv:<20s} "
                    f"from {entry['services']} services, {len(entry['machines'])} machines")
            print('\n' + '-' * 78)
            print(head)
            if len(entry['machines']) <= 12:
                print(f"        machines: {', '.join(entry['machines'])}")
            if entry['existing_id']:
                print(f"        replacing kit {entry['existing_id']}: {entry['existing_name']!r}")
            was = {c['code']: c['quantity'] for c in entry['current_items']}
            now = {i['code'] for i in entry['items']}
            for item in entry['items']:
                old = was.get(item['code'])
                mark = ('       ' if old is None else
                        '  same ' if abs(float(old) - float(item['quantity'])) < 1e-9 else
                        f'  was {old:g}'.ljust(7))
                print(f"    {item['freq_pct']:3d}% ({item['used_on']}/{entry['services']}) "
                      f"{item['code']:<16s} {item['name'][:30]:<30s} "
                      f"{item['quantity']:>7g} {item['unit']:<4s}{mark}")
                print(f"         every amount drawn: {item['spread']}")
            for code, qty in was.items():
                if code not in now:
                    print(f"    REMOVED  {code:<16s} was {qty:g} — below 75%, or not used at all")

        if report['to_deactivate']:
            print('\nSWITCHED OFF (no data behind them any more):')
            for k in report['to_deactivate']:
                print(f"    kit {k['id']}: {k['name']!r}")

        if held:
            print('\nHELD BACK — too few services to trust:')
            for entry in sorted(held, key=lambda e: -e['services']):
                iv = f"{entry['interval_hours']} hr" if entry['interval_hours'] else 'hourly'
                print(f"    {entry['equipment_type']:<6s} "
                      f"{entry['equipment_model'] or '(no model)':<24s} {iv:<12s} "
                      f"{entry['services']} service(s), would have been "
                      f"{len(entry['items'])} items")

        if report['problems']:
            print(f"\nNEEDS YOUR EYE ({len(report['problems'])}):")
            for p in report['problems']:
                print(f'    {p}')

        if not do_apply:
            print('\n' + '=' * 78)
            print('NOTHING WAS CHANGED. Run again with --apply to write it.')
            return

        counts = apply_kits(report=report)
        print('\n' + '=' * 78)
        print(f'WRITTEN: {counts}')

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

    @app.cli.command('rebuild-pool')
    @click.option('--dry-run', is_flag=True,
                  help='Read the files and report, without writing anything.')
    def rebuild_pool_command(dry_run):
        """Re-read the delivered SAP files now, instead of waiting for 02:02.

        The sync already runs nightly, and the only other way to trigger it is
        an HTTP endpoint behind a robot key. After a deploy that changes what the
        sync READS, waiting until tomorrow morning to find out whether it worked
        is a long time to not know.
        """
        from app.services.sap_pool_sync import sync_pool_from_delivered_files

        print('Reading the delivered SAP files...')
        report = sync_pool_from_delivered_files(dry_run=dry_run)
        status = report.get('status')
        print(f"status: {status}")
        if status != 'ok':
            print(f"reason: {report.get('reason')}")
            return

        inputs = report.get('inputs') or {}
        print('files : ' + ' · '.join(
            f"{name}={'yes' if present else 'NO'}"
            for name, present in inputs.items()))
        print(f"orders: {report.get('created')} created, "
              f"{report.get('updated')} updated")

        ops = report.get('operations') or {}
        print()
        print('--- operations (IW49) ---')
        if not ops.get('headers'):
            print('  no IW49 file was read at all')
        elif not ops.get('usable'):
            print('  NOT IMPORTED: ' + str(ops.get('reason')
                                           or 'columns not recognised'))
            for field, hit in (ops.get('matched') or {}).items():
                print(f"    {field:<12} -> {hit or 'NOT FOUND'}")
            print(f"  the file has {len(ops['headers'])} columns:")
            for header in ops['headers']:
                print(f'    {header}')
        else:
            stored = ops.get('stored') or {}
            print(f"  {ops.get('operations')} operations read on "
                  f"{ops.get('orders')} orders in the file")
            print(f"  waiting on material: {ops.get('waiting_on_material')}")
            print(f"  STORED for {stored.get('orders')} orders the app knows "
                  f"({stored.get('skipped_unknown_orders')} orders skipped — "
                  f"closed, or never in the pool)")
            print(f"    added {stored.get('added')} · updated {stored.get('updated')} "
                  f"· removed {stored.get('removed')} · kept {stored.get('kept_but_gone_from_sap')}")
            print(f"  trade labels set from operations: "
                  f"{stored.get('trade_labels_set', 0)} rows")
            _print_pool_coverage(ops)
        if dry_run:
            print()
            print('DRY RUN — nothing was written.')

    @app.cli.command('prune-orphan-operations')
    @click.option('--apply', 'do_apply', is_flag=True,
                  help='Actually delete. Without it, only reports.')
    @click.option('--limit', default=0, type=int,
                  help='Remove at most this many, then stop. For a shell that '
                       'keeps dying: run it a few times, it always resumes.')
    def prune_orphan_operations(do_apply, limit):
        """Remove operation rows for orders the app no longer knows.

        WHY THESE EXIST

        The first production import ran before the scope filter and stored
        operations for every order in the year-to-date export — 56,941 rows
        across 19,375 orders, while the pool held 183. The filter that followed
        stops NEW ones, but it cannot reach the ones already written: the sync
        now skips those orders entirely, so nothing will ever update or delete
        them. They sit in work_plan_job_tasks forever.

        WHAT IT WILL NOT TOUCH

          * anything Ali typed (source != 'sap') — his notes, photos and voice
          * any operation with work on it: ticked, started, or with real hours
          * any order still in the pool or on a plan

        Reports by default. --apply deletes.
        """
        from app.models.work_plan_job_task import WorkPlanJobTask
        from app.services.sap_pool_sync import (_orders_the_app_knows,
                                                orphan_operation_ids,
                                                delete_operation_rows)

        known = _orders_the_app_knows()
        sap_total = WorkPlanJobTask.query.filter_by(source='sap').count()
        manual = WorkPlanJobTask.query.filter(
            WorkPlanJobTask.source != 'sap').count()

        ids = orphan_operation_ids(known, limit=limit or None)

        print(f'Orders the app knows: {len(known)}')
        print(f'SAP operation rows in the table: {sap_total}')
        print(f'  safe to remove                  : {len(ids)}'
              + (f'  (limited to {limit})' if limit else ''))
        print(f'  hand-written lines, never touched : {manual}')

        if not do_apply:
            print()
            print('Nothing deleted. Re-run with --apply to remove them.')
            return

        # One DELETE per batch, not one per row. The first version did a round
        # trip per row and managed 2,500 of 55,381 before the Render shell gave
        # up — while its progress line 'removed 2500/55381' read as finished.
        def say(done, total):
            print(f'  removed {done} of {total}', flush=True)

        removed = delete_operation_rows(ids, on_progress=say)
        left = len(orphan_operation_ids(known))
        print(f'Removed {removed} rows. Still orphaned: {left}')
        if left:
            print('Run it again to continue — every batch is committed, so '
                  'nothing is lost by stopping.')

    def _print_pool_coverage(ops):
        """Does this IW49 actually cover the orders a planner works with?

        2026-09-11: an export with 56,941 operations covered ZERO of the 185
        orders in the pool — it was a history report of finished work. A saved
        variant in SAP feeds the courier, so this can be fixed once and quietly
        regress. Printing it every run means somebody sees it.
        """
        coverage = (ops or {}).get('pool_coverage') or {}
        total = coverage.get('pool_orders') or 0
        if not total:
            return
        covered = coverage.get('with_operations') or 0
        percent = coverage.get('covered_percent')
        print(f"  POOL COVERAGE: {covered} of {total} live pool orders "
              f"have operations ({percent}%)")
        if covered == 0:
            print("    ^ NONE. This IW49 does not contain open orders — its")
            print("      selection in SAP is pulling finished work only. The")
            print("      operations screens will be empty for everything a")
            print("      planner drags onto a week.")
        _print_orders_to_review(ops)

    def _print_orders_to_review(ops):
        """Where a typed operation and a SAP operation meet on the same order.

        Two separate things, both needing a person rather than more code: a SAP
        line that could not be imported because its number is taken, and orders
        where the same work may now be listed twice under two numbers.

        Nobody did anything wrong. A line typed by hand while SAP was silent,
        and SAP's own line for the same work, are two rows with two numbers and
        no way for code to know they are one job. The only honest answer is to
        name the orders so a person can look.
        """
        skipped = (ops or {}).get('skipped_number_taken_by_hand') or []
        if skipped:
            print()
            print(f"  NOT IMPORTED: {len(skipped)} SAP operation(s) use a number")
            print("    you already typed on that order. Your line was left")
            print("    exactly as it is. Rename or delete yours and the next")
            print("    sync brings SAP's in by itself — nothing is lost.")
            for item in skipped[:20]:
                print(f"      {item['order']} op {item['operation_number']}"
                      f" — SAP calls it: {item['sap_text']}")
            if len(skipped) > 20:
                print(f"      ... and {len(skipped) - 20} more")

        review = (ops or {}).get('orders_to_review') or []
        if not review:
            return
        print()
        print(f"  CHECK BY HAND: {len(review)} order(s) now hold BOTH an")
        print("    operation you typed and an operation from SAP. If they are")
        print("    the same work, the hours are counted twice on the progress")
        print("    bar. Delete whichever line is the duplicate.")
        for order in review[:20]:
            print(f"      {order}")
        if len(review) > 20:
            print(f"      ... and {len(review) - 20} more")

    @app.cli.command('operation-trades')
    def operation_trades():
        """What the work centre column ACTUALLY contains.

        `widened_to_both_trades: 0` could mean "no order needs both teams", or it
        could mean the check is looking for words that are not there. The pool
        sync passes SAP's work centre through RAW — only the manual Excel import
        maps ELEC/MECH/ELME — so if SAP writes something like MES-MECH, both the
        ELME widening AND the phone's trade filter silently match nothing.

        This prints the real values so the mapping is written from the data
        rather than from a guess.
        """
        from app.models.work_plan_job_task import WorkPlanJobTask
        from app.models import SAPWorkOrder, WorkPlanJob

        print('=' * 70)
        print('OPERATION work centres (from IW49)')
        print('=' * 70)
        rows = (db.session.query(WorkPlanJobTask.work_center, db.func.count())
                .filter(WorkPlanJobTask.source == 'sap')
                .group_by(WorkPlanJobTask.work_center)
                .order_by(db.func.count().desc()).all())
        if not rows:
            print('  (no SAP operations stored)')
        for value, count in rows:
            print(f'  {str(value):<24} {count}')

        print()
        print('ORDER work centres (from IW39, in the pool)')
        for value, count in (db.session.query(SAPWorkOrder.work_center,
                                              db.func.count())
                             .group_by(SAPWorkOrder.work_center)
                             .order_by(db.func.count().desc()).all()):
            print(f'  {str(value):<24} {count}')

        print()
        print('JOB work centres (on plans)')
        for value, count in (db.session.query(WorkPlanJob.work_center,
                                              db.func.count())
                             .group_by(WorkPlanJob.work_center)
                             .order_by(db.func.count().desc()).all()):
            print(f'  {str(value):<24} {count}')

        print()
        print('=' * 70)
        print('DO THE POOL ORDERS HAVE OPERATIONS AT ALL?')
        print('=' * 70)
        # 35 rows changed when well over a hundred was expected, and the pool's
        # work centres did not move at all. Either the pool's orders are not in
        # IW49, or their numbers do not match the ones stored on the operations.
        pool = [n for (n,) in db.session.query(SAPWorkOrder.order_number)
                .filter(SAPWorkOrder.work_plan_id.is_(None),
                        SAPWorkOrder.status == 'pending').all() if n]
        with_ops = {k for (k,) in db.session.query(WorkPlanJobTask.anchor_key)
                    .filter(WorkPlanJobTask.source == 'sap').distinct().all()}
        have = [n for n in pool if str(n).strip() in with_ops]
        missing = [n for n in pool if str(n).strip() not in with_ops]
        print(f'  pool orders            : {len(pool)}')
        print(f'  ...with operations     : {len(have)}')
        print(f'  ...WITHOUT operations  : {len(missing)}')
        print('  sample pool numbers WITHOUT operations:')
        for number in missing[:8]:
            print(f'    {number!r}')
        print('  sample anchor keys that DO have operations:')
        for key in list(with_ops)[:8]:
            print(f'    {key!r}')

        print()
        print('Orders whose operations use MORE THAN ONE work centre:')
        pairs = (db.session.query(WorkPlanJobTask.anchor_key,
                                  WorkPlanJobTask.work_center)
                 .filter(WorkPlanJobTask.source == 'sap',
                         WorkPlanJobTask.work_center.isnot(None))
                 .distinct().all())
        by_order = {}
        for key, wc in pairs:
            by_order.setdefault(key, set()).add(wc)
        mixed = {k: v for k, v in by_order.items() if len(v) > 1}
        print(f'  {len(mixed)} of {len(by_order)} orders')
        for key, trades in list(mixed.items())[:15]:
            print(f'    {key}: {sorted(trades)}')

    @app.cli.command('sap-operation-headers')
    def sap_operation_headers():
        """Print the column names in the latest IW49 export.

        THE POINT OF THIS COMMAND

        We do not have a real IW49 file, and SAP layouts differ between systems
        and between a user's saved variants. `parse_operations` therefore tries a
        list of candidate names for each field and imports nothing if it
        recognises none — deliberately, because the strict reader RAISES on a
        missing column and a guessed name would take the whole pool sync down
        rather than just skipping the operations.

        Run this against a real export and it prints exactly what the columns are
        called, so the right names can be added to OPERATION_COLUMN_CANDIDATES
        and the guessing ends.
        """
        from app.services.sap_pool_sync import _current_file_bytes
        from app.services.sap_order_parser import read_iw49_headers

        data, name = _current_file_bytes(sheet_name='IW49')
        if not data:
            print('No IW49 file found in the delivered files.')
            return

        info = read_iw49_headers(data)
        print(f'IW49 file: {name}')
        print(f'\n{len(info["headers"])} columns:')
        for header in info['headers']:
            print(f'  {header}')

        print('\nMatched:')
        for field, matched in info['matched'].items():
            print(f'  {field:<12} -> {matched or "NOT FOUND"}')

        if info['missing']:
            print('\nMissing: ' + ', '.join(info['missing']))
            print('Add the real names to OPERATION_COLUMN_CANDIDATES in')
            print('app/services/sap_order_parser.py')
        else:
            print('\nEvery operation column was recognised.')

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

    @app.cli.command('fix-role-id-mismatch')
    def fix_role_id_mismatch():
        """
        Fix users whose role_id prefix does not match their current role.
        - Specialists with INS/ENG prefix: promote their SPC minor_role_id to primary,
          or generate a new SPC-XXX if none exists.
        - Inspectors with SPC prefix: same logic in reverse.
        Safe to run multiple times — skips users who are already correct.
        """
        from app.models import User
        from app.api.users import _generate_role_id

        role_prefixes = {
            'inspector': 'INS',
            'specialist': 'SPC',
            'engineer': 'ENG',
            'quality_engineer': 'QE',
            'maintenance': 'MNT',
            'admin': 'ADM',
        }

        users = User.query.filter(
            User.role.in_(['inspector', 'specialist'])
        ).all()

        count = 0
        for user in users:
            expected_prefix = role_prefixes.get(user.role)
            if not expected_prefix:
                continue
            current_prefix = user.role_id[:3] if user.role_id else ''
            if current_prefix == expected_prefix:
                continue  # Already correct

            print(f'\n  {user.sap_id} {user.full_name}')
            print(f'    role={user.role}, role_id={user.role_id}, minor_role_id={user.minor_role_id}')

            minor_prefix = user.minor_role_id[:3] if user.minor_role_id else ''

            if minor_prefix == expected_prefix:
                # The correct ID is already sitting as the minor — swap
                old_role_id = user.role_id
                old_minor_role_id = user.minor_role_id
                old_minor_role = user.minor_role
                user.role_id = old_minor_role_id
                user.minor_role_id = old_role_id
                user.minor_role = user.role  # old role becomes minor
                # role stays the same
                print(f'    → SWAP: role_id={user.role_id}, minor_role_id={user.minor_role_id}')
            else:
                # No matching secondary ID — generate a fresh one
                try:
                    new_id = _generate_role_id(user.role)
                    old_role_id = user.role_id
                    user.minor_role_id = old_role_id
                    user.minor_role = user.minor_role or 'inspector'  # keep or default
                    user.role_id = new_id
                    print(f'    → GENERATE: role_id={user.role_id}, minor_role_id={user.minor_role_id}')
                except Exception as e:
                    print(f'    ERROR: {e}')
                    continue

            count += 1

        if count == 0:
            print('All role IDs already match their roles. Nothing to do.')
            return

        db.session.commit()
        print(f'\nDone. {count} user(s) fixed.')

    @app.cli.command('backfill-minor-ids')
    def backfill_minor_ids():
        """
        Assign missing minor role IDs to all inspectors and specialists who only have
        one ID. Safe to run multiple times — skips users who already have both IDs.
        Example: an inspector with role_id=INS-027 but no minor_role_id gets SPC-XXX.
        """
        from app.models import User
        from app.api.users import _get_minor_role, _generate_role_id

        users = User.query.filter(
            User.role.in_(['inspector', 'specialist']),
            User.minor_role_id.is_(None)
        ).all()

        if not users:
            print('All inspectors/specialists already have both IDs. Nothing to do.')
            return

        print(f'Found {len(users)} user(s) missing a secondary ID:\n')
        count = 0
        for user in users:
            minor_role = _get_minor_role(user.role)
            if not minor_role:
                continue
            try:
                new_id = _generate_role_id(minor_role)
                user.minor_role = minor_role
                user.minor_role_id = new_id
                count += 1
                print(f'  {user.role_id} ({user.full_name})  →  {new_id}')
            except Exception as e:
                print(f'  ERROR for {user.full_name}: {e}')

        db.session.commit()
        print(f'\nDone. {count} user(s) updated.')

    @app.cli.command('fix-assignment-templates')
    def fix_assignment_templates():
        """
        Fix InspectionAssignments that have a null template_id.
        Scans active assignments, looks up the correct template by equipment type
        (same logic as start_inspection), and updates the record.
        Run this whenever assignments are created without a template (e.g. after
        adding new equipment types or routines).
        """
        from app.models import InspectionAssignment, Equipment, ChecklistTemplate, InspectionRoutine

        active_statuses = ['assigned', 'in_progress', 'mech_complete', 'elec_complete', 'both_complete']
        assignments = InspectionAssignment.query.filter(
            InspectionAssignment.template_id.is_(None),
            InspectionAssignment.status.in_(active_statuses),
        ).all()

        if not assignments:
            print('No assignments with null template_id found. Nothing to do.')
            return

        print(f'Found {len(assignments)} assignment(s) with null template_id:\n')
        fixed = 0
        skipped = 0

        for a in assignments:
            equipment = db.session.get(Equipment, a.equipment_id)
            if not equipment:
                print(f'  Assignment {a.id}: equipment {a.equipment_id} not found — skipped')
                skipped += 1
                continue

            eq_type = equipment.equipment_type
            template = None

            # Fallback 1a: exact match on ChecklistTemplate.equipment_type
            template = ChecklistTemplate.query.filter_by(
                equipment_type=eq_type, is_active=True
            ).first()

            # Fallback 1b: comma-separated list match
            if not template:
                normalized = eq_type.lower().replace(' ', '_')
                for t in ChecklistTemplate.query.filter_by(is_active=True).all():
                    if t.equipment_type and ',' in t.equipment_type:
                        if normalized in [x.strip() for x in t.equipment_type.split(',')]:
                            template = t
                            break

            # Fallback 2: via InspectionRoutine asset_types
            if not template:
                for routine in InspectionRoutine.query.filter_by(is_active=True).all():
                    if eq_type in (routine.asset_types or []):
                        template = db.session.get(ChecklistTemplate, routine.template_id)
                        if template:
                            break

            if template:
                a.template_id = template.id
                fixed += 1
                print(f'  Assignment {a.id} ({eq_type}): → template {template.id} "{template.name}"')
            else:
                skipped += 1
                print(f'  Assignment {a.id} ({eq_type}): no template found — skipped')

        if fixed:
            db.session.commit()
            print(f'\nDone. {fixed} assignment(s) fixed, {skipped} skipped.')
        else:
            print(f'\nNo assignments could be fixed. {skipped} skipped (no matching template).')
            print('Check that ChecklistTemplates exist for the equipment types above.')

    @app.cli.command('cleanup-data')
    def cleanup_data():
        """
        Remove all operational/test data while keeping imported base data.
        Keeps: users, equipment, checklist templates/items, PM templates, materials,
               vendors, storage_locations, job_templates, answer_templates, worker_skills,
               capacity_configs, leave_types, leave_policies, notification_templates,
               notification_rules, translations, achievements, challenges.
        Deletes: all inspections, work plans, defects, notifications, chat, HR, gamification,
                 stock history, media files (also purged from Cloudinary).
        """
        from sqlalchemy import text
        from app.models import File

        print('\n🧹 Starting full data cleanup (keeping users, equipment, checklists)...\n')

        # Step 1: Purge Cloudinary files before touching DB
        print('📁 Purging media files from Cloudinary...')
        files = File.query.all()
        deleted_files = 0
        failed_files = 0
        if files:
            try:
                import cloudinary
                import cloudinary.uploader
                cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
                api_key = os.getenv('CLOUDINARY_API_KEY')
                api_secret = os.getenv('CLOUDINARY_API_SECRET')
                if all([cloud_name, api_key, api_secret]):
                    cloudinary.config(cloud_name=cloud_name, api_key=api_key,
                                      api_secret=api_secret, secure=True)
                    for f in files:
                        if f.stored_filename and not f.stored_filename.startswith('/'):
                            try:
                                resource_type = 'video' if f.mime_type and (
                                    'video' in f.mime_type or 'audio' in f.mime_type) else 'image'
                                cloudinary.uploader.destroy(f.stored_filename,
                                                             resource_type=resource_type)
                                deleted_files += 1
                            except Exception:
                                failed_files += 1
                    print(f'  ✓ Deleted {deleted_files} file(s) from Cloudinary'
                          + (f', {failed_files} failed' if failed_files else ''))
                else:
                    print('  ⚠️  Cloudinary not configured — skipping cloud file deletion')
            except ImportError:
                print('  ⚠️  Cloudinary not installed — skipping cloud file deletion')
        else:
            print('  ✓ No files to delete')

        # Step 2: Delete all operational data in one transaction
        print('\n🗑️  Deleting operational data...')

        is_sqlite = 'sqlite' in str(db.engine.url)

        tables = [
            # Chat
            'message_read_receipts', 'team_messages', 'channel_members', 'team_channels',
            # Notifications
            'notification_analytics', 'notification_escalations',
            'notification_schedules', 'notifications',
            # Work plan job-level children (must precede work_plan_jobs)
            'job_review_marks', 'job_showup_photos', 'job_challenge_voices',
            'job_takeovers', 'pause_logs', 'bonus_stars', 'job_checklist_responses',
            'job_dependencies', 'work_plan_job_trackings', 'work_plan_job_logs',
            'work_plan_job_ratings', 'work_plan_assignments', 'work_plan_materials',
            'engineer_job_voice_notes', 'engineer_job_locations',
            'specialist_jobs', 'engineer_jobs', 'work_plan_jobs',
            # Work plan day & plan level
            'work_plan_daily_reviews', 'work_plan_days',
            'scheduling_conflicts', 'work_plan_carry_overs', 'work_plan_versions',
            'work_plan_pause_requests', 'work_plan_performances', 'work_plans',
            # equipment_readings references inspections — must come BEFORE inspections
            'equipment_readings',
            # Inspection data (inspection_assignments before inspection_lists due to FK)
            'inspection_answers', 'defect_assessments', 'defect_occurrences',
            'quality_reviews', 'inspection_ratings', 'monitor_followups',
            'final_assessments', 'defects', 'inspections',
            'inspection_assignments', 'inspection_lists',
            'inspection_schedules', 'inspection_routines',
            # Other operational
            'sap_work_orders', 'unplanned_jobs', 'shift_handovers',
            'running_hours_readings', 'running_hours_alerts',
            'equipment_status_logs', 'equipment_notes',
            'equipment_certifications', 'equipment_watches',
            # Gamification
            'user_achievements', 'user_challenges', 'user_levels', 'user_streaks',
            'point_history', 'leaderboard_snapshots', 'performance_goals',
            'weekly_completions',
            # HR
            'leaves', 'leave_balance_history', 'leave_encashments',
            'leave_calendar', 'leave_blackouts',
            'shift_swap_requests', 'role_swap_logs', 'roster_entries',
            # Stock operational
            'stock_reservations', 'stock_history', 'material_batches',
            'price_history', 'inventory_count_items', 'inventory_counts',
            # Misc
            'sync_queue', 'import_logs', 'token_blocklist', 'admin_activity_logs',
            # Files last — all referencing rows deleted above
            'files',
        ]

        total_deleted = 0

        if is_sqlite:
            # SQLite: disable FK checks so order doesn't matter for local dev DB
            db.session.execute(text('PRAGMA foreign_keys = OFF'))
            for table in tables:
                try:
                    result = db.session.execute(text(f'DELETE FROM {table}'))
                    count = result.rowcount
                    if count:
                        print(f'  ✓ {table}: {count} row(s) deleted')
                    total_deleted += count
                except Exception as e:
                    print(f'  ⚠️  {table}: skipped ({e})')
            db.session.execute(text('PRAGMA foreign_keys = ON'))
        else:
            # PostgreSQL: TRUNCATE CASCADE on each table — handles all FK deps automatically.
            # CASCADE only propagates to tables referencing the target, never to parent tables
            # (users, equipment, checklists) so those are safe.
            for table in tables:
                try:
                    db.session.execute(text(f'TRUNCATE TABLE {table} CASCADE'))
                    print(f'  ✓ {table}')
                    total_deleted += 1
                except Exception as e:
                    print(f'  ⚠️  {table}: skipped ({e})')

        try:
            db.session.commit()
            print(f'\n✅ Cleanup complete — {total_deleted} table(s) cleared.')
            print('   Kept: users, equipment, checklists, PM templates, materials.\n')
        except Exception as e:
            db.session.rollback()
            print(f'\n❌ Commit failed: {e}')

    @app.before_request
    def _warn_once_about_excluded_planning_roles():
        """Shout if anyone holds a role the planner excludes.

        Planning is admin+engineer only. That is safe today because nobody holds
        'quality_engineer' as a PRIMARY role — it exists only as the auto-paired
        minor role of engineer. If that ever stops being true, the affected user
        would hit an unexplained 403 with nothing to point at. This surfaces it
        in the logs instead of on a Monday morning.
        """
        if getattr(app, '_planning_roles_checked', False):
            return
        app._planning_roles_checked = True
        try:
            from app.models import User
            from app.api.work_plans import PLANNING_ROLES
            blocked = User.query.filter(
                User.is_active.is_(True),
                User.role.notin_(PLANNING_ROLES),
                User.minor_role.in_(PLANNING_ROLES),
            ).all()
            if blocked:
                app.logger.warning(
                    'PLANNING ACCESS: %d active user(s) hold a planning role only as a '
                    'MINOR role and cannot reach the planner: %s',
                    len(blocked),
                    ', '.join(f'{u.full_name} (role={u.role}, minor={u.minor_role})' for u in blocked),
                )
        except Exception:  # noqa: BLE001 - never let a diagnostic break startup
            app.logger.debug('Planning-role check skipped', exc_info=True)

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
