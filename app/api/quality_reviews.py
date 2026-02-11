"""
Quality Review endpoints.
QE reviews completed specialist/engineer jobs.
Enhanced with statistics, SLA reporting, trends, templates, and AI analysis.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.quality_service import QualityService
from app.utils.decorators import get_current_user, admin_required, quality_engineer_required, role_required, get_language
from app.models import QualityReview, User
from app.utils.pagination import paginate
from app.extensions import db
from sqlalchemy import func, and_, or_, case
from datetime import datetime, date, timedelta
from collections import defaultdict

bp = Blueprint('quality_reviews', __name__)


# ============================================
# STATISTICS & ANALYTICS ENDPOINTS
# ============================================

@bp.route('/stats', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def get_qc_stats():
    """
    Get quality review statistics for dashboard.
    Returns comprehensive QC metrics including approval rates, SLA compliance, and trends.
    """
    user = get_current_user()
    today = date.today()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)
    prev_month_start = today - timedelta(days=60)
    prev_month_end = today - timedelta(days=31)

    # Base query - filter by QE if not admin
    base_query = QualityReview.query
    if user.role != 'admin':
        base_query = base_query.filter_by(qe_id=user.id)

    # Total reviews count
    total_reviews = base_query.count()

    # Status counts
    approved_count = base_query.filter_by(status='approved').count()
    rejected_count = base_query.filter_by(status='rejected').count()
    pending_count = base_query.filter_by(status='pending').count()

    # Approval rate
    completed_reviews = approved_count + rejected_count
    approval_rate = round((approved_count / completed_reviews * 100), 1) if completed_reviews > 0 else 0

    # Average review time (time from creation to reviewed_at)
    avg_review_time_result = db.session.query(
        func.avg(
            func.julianday(QualityReview.reviewed_at) - func.julianday(QualityReview.created_at)
        )
    ).filter(
        QualityReview.reviewed_at.isnot(None)
    )
    if user.role != 'admin':
        avg_review_time_result = avg_review_time_result.filter(QualityReview.qe_id == user.id)
    avg_review_days = avg_review_time_result.scalar()
    avg_review_time_hours = round(avg_review_days * 24, 1) if avg_review_days else 0

    # SLA compliance rate
    sla_reviews = base_query.filter(QualityReview.sla_met.isnot(None)).count()
    sla_met_count = base_query.filter(QualityReview.sla_met == True).count()
    sla_compliance_rate = round((sla_met_count / sla_reviews * 100), 1) if sla_reviews > 0 else 100

    # Reviews by rejection category
    category_counts = db.session.query(
        QualityReview.rejection_category,
        func.count(QualityReview.id)
    ).filter(
        QualityReview.status == 'rejected',
        QualityReview.rejection_category.isnot(None)
    )
    if user.role != 'admin':
        category_counts = category_counts.filter(QualityReview.qe_id == user.id)
    category_counts = category_counts.group_by(QualityReview.rejection_category).all()
    reviews_by_category = {cat: count for cat, count in category_counts if cat}

    # Reviews by job type
    job_type_counts = db.session.query(
        QualityReview.job_type,
        func.count(QualityReview.id)
    )
    if user.role != 'admin':
        job_type_counts = job_type_counts.filter(QualityReview.qe_id == user.id)
    job_type_counts = job_type_counts.group_by(QualityReview.job_type).all()
    reviews_by_job_type = {jt: count for jt, count in job_type_counts}

    # Trend comparison (current month vs previous month)
    current_month_reviews = base_query.filter(
        QualityReview.created_at >= month_ago
    ).count()

    prev_month_query = QualityReview.query.filter(
        QualityReview.created_at >= prev_month_start,
        QualityReview.created_at < prev_month_end
    )
    if user.role != 'admin':
        prev_month_query = prev_month_query.filter(QualityReview.qe_id == user.id)
    prev_month_reviews = prev_month_query.count()

    if prev_month_reviews > 0:
        trend_percentage = round(((current_month_reviews - prev_month_reviews) / prev_month_reviews * 100), 1)
    else:
        trend_percentage = 100 if current_month_reviews > 0 else 0

    trend_direction = 'up' if trend_percentage > 0 else ('down' if trend_percentage < 0 else 'stable')

    # Weekly breakdown (last 7 days)
    weekly_data = []
    for i in range(7):
        d = today - timedelta(days=i)
        day_start = datetime.combine(d, datetime.min.time())
        day_end = datetime.combine(d, datetime.max.time())

        day_query = base_query.filter(
            QualityReview.created_at >= day_start,
            QualityReview.created_at <= day_end
        )
        day_total = day_query.count()
        day_approved = day_query.filter(QualityReview.status == 'approved').count()
        day_rejected = day_query.filter(QualityReview.status == 'rejected').count()

        weekly_data.append({
            'date': d.isoformat(),
            'total': day_total,
            'approved': day_approved,
            'rejected': day_rejected
        })

    return jsonify({
        'status': 'success',
        'data': {
            'summary': {
                'total_reviews': total_reviews,
                'approved': approved_count,
                'rejected': rejected_count,
                'pending': pending_count,
                'approval_rate': approval_rate,
                'avg_review_time_hours': avg_review_time_hours,
                'sla_compliance_rate': sla_compliance_rate
            },
            'reviews_by_category': reviews_by_category,
            'reviews_by_job_type': reviews_by_job_type,
            'trend': {
                'current_period': current_month_reviews,
                'previous_period': prev_month_reviews,
                'percentage_change': trend_percentage,
                'direction': trend_direction
            },
            'weekly_breakdown': weekly_data
        }
    }), 200


@bp.route('/sla-report', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def get_sla_report():
    """
    Get SLA compliance details.
    Returns on-time reviews, breached reviews with details, and reviewer breakdown.
    """
    user = get_current_user()

    # Date range filter
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if start_date_str:
        start_date = datetime.fromisoformat(start_date_str)
    else:
        start_date = datetime.utcnow() - timedelta(days=30)

    if end_date_str:
        end_date = datetime.fromisoformat(end_date_str)
    else:
        end_date = datetime.utcnow()

    # Base query
    base_query = QualityReview.query.filter(
        QualityReview.created_at >= start_date,
        QualityReview.created_at <= end_date
    )
    if user.role != 'admin':
        base_query = base_query.filter(QualityReview.qe_id == user.id)

    # On-time reviews (sla_met = True)
    on_time_count = base_query.filter(QualityReview.sla_met == True).count()

    # Breached reviews (sla_met = False or pending past deadline)
    now = datetime.utcnow()
    breached_reviews = base_query.filter(
        or_(
            QualityReview.sla_met == False,
            and_(
                QualityReview.status == 'pending',
                QualityReview.sla_deadline < now
            )
        )
    ).order_by(QualityReview.created_at.desc()).limit(50).all()

    breached_list = []
    for review in breached_reviews:
        qe = db.session.get(User, review.qe_id)
        breached_list.append({
            'id': review.id,
            'job_type': review.job_type,
            'job_id': review.job_id,
            'qe_id': review.qe_id,
            'qe_name': qe.full_name if qe else 'Unknown',
            'created_at': review.created_at.isoformat() if review.created_at else None,
            'sla_deadline': review.sla_deadline.isoformat() if review.sla_deadline else None,
            'reviewed_at': review.reviewed_at.isoformat() if review.reviewed_at else None,
            'status': review.status,
            'hours_overdue': round((now - review.sla_deadline).total_seconds() / 3600, 1) if review.sla_deadline and review.sla_deadline < now else 0
        })

    # Average response time (in hours)
    avg_response = db.session.query(
        func.avg(
            func.julianday(QualityReview.reviewed_at) - func.julianday(QualityReview.created_at)
        )
    ).filter(
        QualityReview.reviewed_at.isnot(None),
        QualityReview.created_at >= start_date,
        QualityReview.created_at <= end_date
    )
    if user.role != 'admin':
        avg_response = avg_response.filter(QualityReview.qe_id == user.id)
    avg_response_days = avg_response.scalar()
    avg_response_time_hours = round(avg_response_days * 24, 1) if avg_response_days else 0

    # By reviewer breakdown (admin only shows all reviewers)
    reviewer_breakdown = []
    if user.role == 'admin':
        reviewer_stats = db.session.query(
            User.id,
            User.full_name,
            func.count(QualityReview.id).label('total'),
            func.sum(case((QualityReview.sla_met == True, 1), else_=0)).label('on_time'),
            func.sum(case((QualityReview.sla_met == False, 1), else_=0)).label('breached')
        ).join(
            QualityReview, QualityReview.qe_id == User.id
        ).filter(
            QualityReview.created_at >= start_date,
            QualityReview.created_at <= end_date
        ).group_by(User.id, User.full_name).all()

        for r_id, r_name, total, on_time, breached in reviewer_stats:
            compliance_rate = round((on_time / total * 100), 1) if total > 0 else 100
            reviewer_breakdown.append({
                'reviewer_id': r_id,
                'reviewer_name': r_name,
                'total_reviews': total,
                'on_time': on_time or 0,
                'breached': breached or 0,
                'compliance_rate': compliance_rate
            })
        reviewer_breakdown.sort(key=lambda x: x['compliance_rate'], reverse=True)

    total_with_sla = base_query.filter(QualityReview.sla_met.isnot(None)).count()
    overall_compliance = round((on_time_count / total_with_sla * 100), 1) if total_with_sla > 0 else 100

    return jsonify({
        'status': 'success',
        'data': {
            'period': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            },
            'summary': {
                'total_reviews': total_with_sla,
                'on_time_reviews': on_time_count,
                'breached_count': len(breached_list),
                'avg_response_time_hours': avg_response_time_hours,
                'overall_compliance_rate': overall_compliance
            },
            'breached_reviews': breached_list,
            'by_reviewer': reviewer_breakdown
        }
    }), 200


@bp.route('/trends', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def get_quality_trends():
    """
    Get quality trends over time.
    Returns daily reviews, approval rate trends, common rejection reasons, and defect patterns.
    """
    user = get_current_user()
    today = date.today()

    # Period filter (default 30 days)
    days = request.args.get('days', 30, type=int)
    if days > 90:
        days = 90  # Cap at 90 days
    start_date = today - timedelta(days=days)

    # Base query
    base_filter = []
    if user.role != 'admin':
        base_filter.append(QualityReview.qe_id == user.id)

    # Daily reviews (last N days)
    daily_reviews = []
    for i in range(days):
        d = today - timedelta(days=i)
        day_start = datetime.combine(d, datetime.min.time())
        day_end = datetime.combine(d, datetime.max.time())

        day_query = QualityReview.query.filter(
            QualityReview.created_at >= day_start,
            QualityReview.created_at <= day_end,
            *base_filter
        )

        total = day_query.count()
        approved = day_query.filter(QualityReview.status == 'approved').count()
        rejected = day_query.filter(QualityReview.status == 'rejected').count()
        pending = day_query.filter(QualityReview.status == 'pending').count()

        approval_rate = round((approved / (approved + rejected) * 100), 1) if (approved + rejected) > 0 else 0

        daily_reviews.append({
            'date': d.isoformat(),
            'total': total,
            'approved': approved,
            'rejected': rejected,
            'pending': pending,
            'approval_rate': approval_rate
        })

    # Approval rate trend (weekly averages)
    approval_rate_trend = []
    for week in range(min(days // 7, 12)):
        week_start = today - timedelta(days=(week + 1) * 7)
        week_end = today - timedelta(days=week * 7)

        week_query = QualityReview.query.filter(
            QualityReview.created_at >= datetime.combine(week_start, datetime.min.time()),
            QualityReview.created_at < datetime.combine(week_end, datetime.min.time()),
            *base_filter
        )

        approved = week_query.filter(QualityReview.status == 'approved').count()
        rejected = week_query.filter(QualityReview.status == 'rejected').count()
        rate = round((approved / (approved + rejected) * 100), 1) if (approved + rejected) > 0 else 0

        approval_rate_trend.append({
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'approval_rate': rate,
            'approved': approved,
            'rejected': rejected
        })

    # Common rejection reasons
    rejection_query = db.session.query(
        QualityReview.rejection_category,
        func.count(QualityReview.id).label('count')
    ).filter(
        QualityReview.status == 'rejected',
        QualityReview.rejection_category.isnot(None),
        QualityReview.created_at >= datetime.combine(start_date, datetime.min.time()),
        *base_filter
    ).group_by(QualityReview.rejection_category).order_by(func.count(QualityReview.id).desc()).all()

    common_rejection_reasons = [
        {'category': cat, 'count': count, 'percentage': 0}
        for cat, count in rejection_query
    ]
    total_rejections = sum(r['count'] for r in common_rejection_reasons)
    for reason in common_rejection_reasons:
        reason['percentage'] = round((reason['count'] / total_rejections * 100), 1) if total_rejections > 0 else 0

    # Defect patterns by job type
    defect_by_type = db.session.query(
        QualityReview.job_type,
        QualityReview.rejection_category,
        func.count(QualityReview.id).label('count')
    ).filter(
        QualityReview.status == 'rejected',
        QualityReview.rejection_category.isnot(None),
        QualityReview.created_at >= datetime.combine(start_date, datetime.min.time()),
        *base_filter
    ).group_by(QualityReview.job_type, QualityReview.rejection_category).all()

    defect_patterns = defaultdict(lambda: defaultdict(int))
    for job_type, category, count in defect_by_type:
        defect_patterns[job_type][category] = count
    defect_patterns = {k: dict(v) for k, v in defect_patterns.items()}

    # Quality score trend (based on approval rate moving average)
    quality_scores = []
    for i in range(0, days, 7):
        period_start = today - timedelta(days=i + 7)
        period_end = today - timedelta(days=i)

        period_query = QualityReview.query.filter(
            QualityReview.created_at >= datetime.combine(period_start, datetime.min.time()),
            QualityReview.created_at < datetime.combine(period_end, datetime.min.time()),
            *base_filter
        )
        approved = period_query.filter(QualityReview.status == 'approved').count()
        rejected = period_query.filter(QualityReview.status == 'rejected').count()

        # Quality score: approval rate weighted by volume
        if approved + rejected > 0:
            score = round((approved / (approved + rejected) * 100), 1)
        else:
            score = 100

        quality_scores.append({
            'period_start': period_start.isoformat(),
            'period_end': period_end.isoformat(),
            'quality_score': score
        })

    return jsonify({
        'status': 'success',
        'data': {
            'period_days': days,
            'daily_reviews': daily_reviews,
            'approval_rate_trend': approval_rate_trend,
            'common_rejection_reasons': common_rejection_reasons,
            'defect_patterns': defect_patterns,
            'quality_scores': quality_scores
        }
    }), 200


# ============================================
# TEMPLATE MANAGEMENT ENDPOINTS
# ============================================

# In-memory template storage (in production, use a database model)
# This is a simple implementation - for production, create a QCResponseTemplate model
_qc_templates = []


@bp.route('/templates', methods=['GET', 'POST'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def manage_templates():
    """
    Manage template responses for common feedback.
    GET: List all templates
    POST: Create new template
    Templates have: id, name, category, response_text, is_approval, created_by, created_at
    """
    global _qc_templates

    if request.method == 'GET':
        # Filter by category if provided
        category = request.args.get('category')
        is_approval = request.args.get('is_approval')

        templates = _qc_templates.copy()

        if category:
            templates = [t for t in templates if t['category'] == category]
        if is_approval is not None:
            is_approval_bool = is_approval.lower() == 'true'
            templates = [t for t in templates if t['is_approval'] == is_approval_bool]

        return jsonify({
            'status': 'success',
            'data': templates
        }), 200

    else:  # POST
        user = get_current_user()
        data = request.get_json()

        if not data:
            return jsonify({
                'status': 'error',
                'message': 'Request body is required'
            }), 400

        required_fields = ['name', 'category', 'response_text']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'status': 'error',
                    'message': f'{field} is required'
                }), 400

        # Generate new template ID
        new_id = max([t['id'] for t in _qc_templates], default=0) + 1

        new_template = {
            'id': new_id,
            'name': data['name'],
            'category': data['category'],
            'response_text': data['response_text'],
            'is_approval': data.get('is_approval', False),
            'created_by': user.id,
            'created_by_name': user.full_name,
            'created_at': datetime.utcnow().isoformat()
        }

        _qc_templates.append(new_template)

        return jsonify({
            'status': 'success',
            'message': 'Template created successfully',
            'data': new_template
        }), 201


@bp.route('/templates/<int:template_id>', methods=['GET', 'PUT', 'DELETE'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def manage_template(template_id):
    """
    Manage individual template.
    GET: Get template by ID
    PUT: Update template
    DELETE: Delete template
    """
    global _qc_templates

    template = next((t for t in _qc_templates if t['id'] == template_id), None)

    if not template:
        return jsonify({
            'status': 'error',
            'message': 'Template not found'
        }), 404

    if request.method == 'GET':
        return jsonify({
            'status': 'success',
            'data': template
        }), 200

    elif request.method == 'PUT':
        user = get_current_user()
        data = request.get_json()

        if data.get('name'):
            template['name'] = data['name']
        if data.get('category'):
            template['category'] = data['category']
        if data.get('response_text'):
            template['response_text'] = data['response_text']
        if 'is_approval' in data:
            template['is_approval'] = data['is_approval']

        template['updated_by'] = user.id
        template['updated_at'] = datetime.utcnow().isoformat()

        return jsonify({
            'status': 'success',
            'message': 'Template updated successfully',
            'data': template
        }), 200

    else:  # DELETE
        _qc_templates = [t for t in _qc_templates if t['id'] != template_id]

        return jsonify({
            'status': 'success',
            'message': 'Template deleted successfully'
        }), 200


# ============================================
# AI ANALYSIS ENDPOINT
# ============================================

@bp.route('/ai-analysis', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def get_ai_analysis():
    """
    AI-powered defect analysis.
    Returns defect clusters, recurring issues, suggested preventive actions, and quality predictions.
    """
    user = get_current_user()
    today = date.today()

    # Analysis period
    days = request.args.get('days', 90, type=int)
    start_date = datetime.combine(today - timedelta(days=days), datetime.min.time())

    # Base filter
    base_filter = [
        QualityReview.status == 'rejected',
        QualityReview.created_at >= start_date
    ]
    if user.role != 'admin':
        base_filter.append(QualityReview.qe_id == user.id)

    # Defect clusters - group rejections by category and job type
    cluster_query = db.session.query(
        QualityReview.rejection_category,
        QualityReview.job_type,
        func.count(QualityReview.id).label('count')
    ).filter(*base_filter).group_by(
        QualityReview.rejection_category,
        QualityReview.job_type
    ).all()

    defect_clusters = []
    for category, job_type, count in cluster_query:
        if category:
            defect_clusters.append({
                'cluster_id': f'{category}_{job_type}',
                'category': category,
                'job_type': job_type,
                'occurrence_count': count,
                'severity': _calculate_severity(count, days)
            })
    defect_clusters.sort(key=lambda x: x['occurrence_count'], reverse=True)

    # Recurring issues - patterns that appear multiple times
    recurring_threshold = 3
    recurring_issues = [c for c in defect_clusters if c['occurrence_count'] >= recurring_threshold]

    # Weekly pattern analysis for recurring issues
    for issue in recurring_issues:
        weekly_counts = []
        for week in range(min(days // 7, 12)):
            week_start = today - timedelta(days=(week + 1) * 7)
            week_end = today - timedelta(days=week * 7)

            count = QualityReview.query.filter(
                QualityReview.rejection_category == issue['category'],
                QualityReview.job_type == issue['job_type'],
                QualityReview.created_at >= datetime.combine(week_start, datetime.min.time()),
                QualityReview.created_at < datetime.combine(week_end, datetime.min.time()),
                *base_filter[1:]  # Skip the status filter as it's already applied
            ).count()
            weekly_counts.append(count)

        issue['trend'] = _calculate_trend(weekly_counts)
        issue['weekly_counts'] = weekly_counts[:4]  # Last 4 weeks

    # Suggested preventive actions based on defect patterns
    suggested_actions = _generate_preventive_actions(defect_clusters)

    # Quality predictions based on trends
    quality_predictions = _generate_quality_predictions(
        defect_clusters,
        days,
        user.id if user.role != 'admin' else None
    )

    # Root cause analysis
    root_causes = _analyze_root_causes(defect_clusters)

    # Risk areas identification
    risk_areas = _identify_risk_areas(defect_clusters)

    return jsonify({
        'status': 'success',
        'data': {
            'analysis_period_days': days,
            'defect_clusters': defect_clusters[:10],  # Top 10 clusters
            'recurring_issues': recurring_issues[:5],  # Top 5 recurring issues
            'suggested_preventive_actions': suggested_actions,
            'quality_predictions': quality_predictions,
            'root_cause_analysis': root_causes,
            'risk_areas': risk_areas
        }
    }), 200


def _calculate_severity(count, days):
    """Calculate severity level based on occurrence frequency."""
    frequency = count / (days / 30)  # Monthly frequency
    if frequency >= 10:
        return 'critical'
    elif frequency >= 5:
        return 'high'
    elif frequency >= 2:
        return 'medium'
    return 'low'


def _calculate_trend(weekly_counts):
    """Calculate trend direction based on weekly counts."""
    if len(weekly_counts) < 2:
        return 'stable'

    recent = sum(weekly_counts[:2]) / 2 if len(weekly_counts) >= 2 else weekly_counts[0]
    older = sum(weekly_counts[2:4]) / 2 if len(weekly_counts) >= 4 else sum(weekly_counts[2:]) / max(len(weekly_counts[2:]), 1)

    if older == 0:
        return 'new' if recent > 0 else 'stable'

    change = (recent - older) / older
    if change > 0.2:
        return 'increasing'
    elif change < -0.2:
        return 'decreasing'
    return 'stable'


def _generate_preventive_actions(defect_clusters):
    """Generate suggested preventive actions based on defect patterns."""
    actions = []

    # Map categories to preventive actions
    action_map = {
        'incomplete_work': {
            'action': 'Implement work completion checklists',
            'description': 'Require workers to complete a checklist before marking jobs as done',
            'priority': 'high'
        },
        'poor_quality': {
            'action': 'Enhance quality training program',
            'description': 'Provide additional training on quality standards and workmanship',
            'priority': 'high'
        },
        'safety_violation': {
            'action': 'Conduct safety refresher training',
            'description': 'Mandatory safety training for all affected workers',
            'priority': 'critical'
        },
        'missing_documentation': {
            'action': 'Implement documentation templates',
            'description': 'Provide standardized documentation templates for all job types',
            'priority': 'medium'
        },
        'wrong_procedure': {
            'action': 'Update procedure guides',
            'description': 'Review and clarify job procedures with visual aids',
            'priority': 'high'
        },
        'other': {
            'action': 'Review and categorize issues',
            'description': 'Analyze uncategorized issues to identify new patterns',
            'priority': 'low'
        }
    }

    seen_categories = set()
    for cluster in defect_clusters:
        category = cluster.get('category')
        if category and category not in seen_categories and category in action_map:
            seen_categories.add(category)
            action_info = action_map[category]
            actions.append({
                'category': category,
                'action': action_info['action'],
                'description': action_info['description'],
                'priority': action_info['priority'],
                'affected_job_types': [c['job_type'] for c in defect_clusters if c['category'] == category],
                'estimated_impact': f"Could reduce {category} issues by up to 50%"
            })

    # Sort by priority
    priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    actions.sort(key=lambda x: priority_order.get(x['priority'], 4))

    return actions


def _generate_quality_predictions(defect_clusters, days, qe_id=None):
    """Generate quality predictions based on current trends."""
    today = date.today()
    predictions = {}

    # Overall quality trend
    total_defects = sum(c['occurrence_count'] for c in defect_clusters)
    monthly_rate = total_defects / (days / 30)

    if monthly_rate > 20:
        predictions['overall_risk'] = 'high'
        predictions['predicted_monthly_defects'] = round(monthly_rate * 1.1)  # 10% increase predicted
        predictions['recommendation'] = 'Immediate intervention required to address quality issues'
    elif monthly_rate > 10:
        predictions['overall_risk'] = 'medium'
        predictions['predicted_monthly_defects'] = round(monthly_rate)
        predictions['recommendation'] = 'Monitor closely and implement targeted improvements'
    else:
        predictions['overall_risk'] = 'low'
        predictions['predicted_monthly_defects'] = round(monthly_rate * 0.9)  # 10% decrease predicted
        predictions['recommendation'] = 'Maintain current quality standards'

    # Category-specific predictions
    category_predictions = []
    for cluster in defect_clusters[:5]:  # Top 5 categories
        cat_monthly = cluster['occurrence_count'] / (days / 30)
        trend = cluster.get('trend', 'stable')

        if trend == 'increasing':
            predicted = round(cat_monthly * 1.2)
            risk = 'increasing'
        elif trend == 'decreasing':
            predicted = round(cat_monthly * 0.8)
            risk = 'decreasing'
        else:
            predicted = round(cat_monthly)
            risk = 'stable'

        category_predictions.append({
            'category': cluster['category'],
            'current_monthly_rate': round(cat_monthly, 1),
            'predicted_next_month': predicted,
            'trend': risk
        })

    predictions['by_category'] = category_predictions

    # Confidence score (simplified)
    if total_defects >= 50:
        predictions['confidence'] = 'high'
    elif total_defects >= 20:
        predictions['confidence'] = 'medium'
    else:
        predictions['confidence'] = 'low'

    return predictions


def _analyze_root_causes(defect_clusters):
    """Analyze potential root causes for defect patterns."""
    root_causes = []

    # Analyze by job type concentration
    job_type_totals = defaultdict(int)
    for cluster in defect_clusters:
        job_type_totals[cluster['job_type']] += cluster['occurrence_count']

    for job_type, total in job_type_totals.items():
        if total >= 5:
            root_causes.append({
                'area': f'{job_type} jobs',
                'issue': f'High defect concentration in {job_type} work',
                'potential_causes': [
                    'Inadequate training for job type',
                    'Unclear procedures or specifications',
                    'Insufficient time allocation',
                    'Tool or equipment issues'
                ],
                'defect_count': total
            })

    # Analyze by category concentration
    category_totals = defaultdict(int)
    for cluster in defect_clusters:
        if cluster['category']:
            category_totals[cluster['category']] += cluster['occurrence_count']

    for category, total in category_totals.items():
        if total >= 5 and category not in ['other']:
            cause_map = {
                'incomplete_work': ['Time pressure', 'Unclear scope', 'Worker fatigue'],
                'poor_quality': ['Skill gaps', 'Inadequate supervision', 'Poor materials'],
                'safety_violation': ['Training gaps', 'Complacency', 'Pressure to finish quickly'],
                'missing_documentation': ['Complex requirements', 'No templates', 'Time constraints'],
                'wrong_procedure': ['Outdated procedures', 'Poor communication', 'Lack of references']
            }

            root_causes.append({
                'area': category.replace('_', ' ').title(),
                'issue': f'Recurring {category.replace("_", " ")} issues',
                'potential_causes': cause_map.get(category, ['Requires further investigation']),
                'defect_count': total
            })

    root_causes.sort(key=lambda x: x['defect_count'], reverse=True)
    return root_causes[:5]


def _identify_risk_areas(defect_clusters):
    """Identify high-risk areas requiring attention."""
    risk_areas = []

    for cluster in defect_clusters:
        if cluster['severity'] in ['critical', 'high']:
            risk_areas.append({
                'area': f"{cluster['job_type']} - {cluster['category']}",
                'severity': cluster['severity'],
                'occurrence_count': cluster['occurrence_count'],
                'action_required': True,
                'suggested_action': f"Review all {cluster['job_type']} jobs for {cluster['category'].replace('_', ' ')} issues"
            })

    risk_areas.sort(key=lambda x: ({'critical': 0, 'high': 1}.get(x['severity'], 2), -x['occurrence_count']))
    return risk_areas[:5]


@bp.route('', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def list_reviews():
    """List quality reviews. QE sees own, admin sees all."""
    user = get_current_user()
    status = request.args.get('status')

    if user.role == 'admin':
        query = QualityReview.query
    else:
        query = QualityReview.query.filter_by(qe_id=user.id)

    if status:
        query = query.filter_by(status=status)

    query = query.order_by(QualityReview.created_at.desc())
    items, pagination_meta = paginate(query)
    language = get_language(user)

    return jsonify({
        'status': 'success',
        'data': [r.to_dict(language=language) for r in items],
        'pagination': pagination_meta
    }), 200


@bp.route('/<int:review_id>', methods=['GET'])
@jwt_required()
def get_review(review_id):
    """Get review details."""
    review = QualityReview.query.get_or_404(review_id)
    return jsonify({
        'status': 'success',
        'data': review.to_dict()
    }), 200


@bp.route('/pending', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def pending_reviews():
    """Get pending reviews for current QE or all pending if admin."""
    user = get_current_user()

    # Admin sees all pending reviews, QE sees only theirs
    if user.role == 'admin':
        reviews = QualityReview.query.filter_by(status='pending').all()
    else:
        reviews = QualityService.get_pending_reviews(user.id)

    return jsonify({
        'status': 'success',
        'data': [r.to_dict() for r in reviews]
    }), 200


@bp.route('/overdue', methods=['GET'])
@jwt_required()
@role_required('admin', 'quality_engineer')
def overdue_reviews():
    """Get reviews past SLA deadline."""
    reviews = QualityService.get_overdue_reviews()

    return jsonify({
        'status': 'success',
        'data': [r.to_dict() for r in reviews]
    }), 200


@bp.route('/<int:review_id>/approve', methods=['POST'])
@jwt_required()
@quality_engineer_required()
def approve_review(review_id):
    """QE approves job quality."""
    user = get_current_user()
    data = request.get_json()

    review = QualityService.approve_review(
        review_id=review_id,
        qe_id=user.id,
        qc_rating=data['qc_rating'],
        notes=data.get('notes')
    )

    # Auto-translate notes
    if data.get('notes'):
        from app.utils.bilingual import auto_translate_and_save
        auto_translate_and_save('quality_review', review.id, {'notes': data['notes']})

    return jsonify({
        'status': 'success',
        'message': 'Quality review approved',
        'data': review.to_dict()
    }), 200


@bp.route('/<int:review_id>/reject', methods=['POST'])
@jwt_required()
@quality_engineer_required()
def reject_review(review_id):
    """QE rejects job quality."""
    user = get_current_user()
    data = request.get_json()

    review = QualityService.reject_review(
        review_id=review_id,
        qe_id=user.id,
        rejection_reason=data['rejection_reason'],
        rejection_category=data['rejection_category'],
        evidence_photos=data.get('evidence_photos')
    )

    # Auto-translate rejection reason
    from app.utils.bilingual import auto_translate_and_save
    auto_translate_and_save('quality_review', review.id, {
        'rejection_reason': data['rejection_reason']
    })

    return jsonify({
        'status': 'success',
        'message': 'Quality review rejected. Pending admin validation.',
        'data': review.to_dict()
    }), 200


@bp.route('/<int:review_id>/validate', methods=['POST'])
@jwt_required()
@admin_required()
def validate_rejection(review_id):
    """Admin validates QE rejection."""
    user = get_current_user()
    data = request.get_json()

    review = QualityService.validate_rejection(
        review_id=review_id,
        admin_id=user.id,
        is_valid=data['is_valid']
    )

    return jsonify({
        'status': 'success',
        'message': f'Rejection validated as {"valid" if data["is_valid"] else "invalid"}',
        'data': review.to_dict()
    }), 200
