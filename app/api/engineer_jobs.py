"""
Engineer Job endpoints.
Three job types: custom_project, system_review, special_task.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.engineer_job_service import EngineerJobService
from app.utils.decorators import get_current_user, admin_required, engineer_required, role_required, get_language
from app.models import EngineerJob
from app.utils.pagination import paginate

bp = Blueprint('engineer_jobs', __name__)


@bp.route('', methods=['GET'])
@jwt_required()
def list_jobs():
    """List engineer jobs. Engineers see own, admins see all."""
    user = get_current_user()
    status = request.args.get('status')

    if user.role == 'admin':
        query = EngineerJob.query
        if status:
            query = query.filter_by(status=status)
        query = query.order_by(EngineerJob.created_at.desc())
    else:
        query = EngineerJob.query.filter_by(engineer_id=user.id)
        if status:
            query = query.filter_by(status=status)
        query = query.order_by(EngineerJob.created_at.desc())

    items, pagination_meta = paginate(query)
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'data': [j.to_dict(language=language) for j in items],
        'pagination': pagination_meta
    }), 200


@bp.route('', methods=['POST'])
@jwt_required()
@role_required('admin', 'engineer')
def create_job():
    """Create a new engineer job."""
    user = get_current_user()
    data = request.get_json()

    engineer_id = data.get('engineer_id', user.id)

    job = EngineerJobService.create_job(
        engineer_id=engineer_id,
        job_type=data['job_type'],
        title=data['title'],
        description=data['description'],
        equipment_id=data.get('equipment_id'),
        category=data.get('category', 'minor'),
        major_reason=data.get('major_reason')
    )

    # Auto-translate text fields
    from app.utils.bilingual import auto_translate_and_save
    fields_to_translate = {'title': data['title'], 'description': data['description']}
    if data.get('major_reason'):
        fields_to_translate['major_reason'] = data['major_reason']
    auto_translate_and_save('engineer_job', job.id, fields_to_translate)

    return jsonify({
        'status': 'success',
        'message': f'Engineer job {job.job_id} created',
        'data': job.to_dict()
    }), 201


@bp.route('/<int:job_id>', methods=['GET'])
@jwt_required()
def get_job(job_id):
    """Get engineer job details."""
    job = EngineerJob.query.get_or_404(job_id)
    user = get_current_user()

    if user.role != 'admin' and job.engineer_id != user.id:
        if not job.planned_time_hours:
            return jsonify({
                'status': 'error',
                'message': 'Must enter planned time first',
                'code': 'PLANNED_TIME_REQUIRED'
            }), 403

    language = get_language(user)
    return jsonify({
        'status': 'success',
        'data': job.to_dict(language=language)
    }), 200


@bp.route('/<int:job_id>/planned-time', methods=['POST'])
@jwt_required()
@engineer_required()
def enter_planned_time(job_id):
    """Enter planned time estimate."""
    user = get_current_user()
    data = request.get_json()

    job = EngineerJobService.enter_planned_time(
        job_id=job_id,
        engineer_id=user.id,
        planned_time_days=data.get('planned_time_days', 0),
        planned_time_hours=data['planned_time_hours']
    )

    return jsonify({
        'status': 'success',
        'message': 'Planned time entered',
        'data': job.to_dict()
    }), 200


@bp.route('/<int:job_id>/start', methods=['POST'])
@jwt_required()
@engineer_required()
def start_job(job_id):
    """Start engineer job timer."""
    user = get_current_user()
    job = EngineerJobService.start_job(job_id, user.id)

    return jsonify({
        'status': 'success',
        'message': 'Job started',
        'data': job.to_dict()
    }), 200


@bp.route('/<int:job_id>/complete', methods=['POST'])
@jwt_required()
@engineer_required()
def complete_job(job_id):
    """Complete an engineer job."""
    user = get_current_user()
    data = request.get_json()

    job = EngineerJobService.complete_job(
        job_id=job_id,
        engineer_id=user.id,
        work_notes=data['work_notes']
    )

    # Auto-translate work notes
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('engineer_job', job.id, {'work_notes': data['work_notes']})

    return jsonify({
        'status': 'success',
        'message': 'Job completed',
        'data': job.to_dict()
    }), 200
