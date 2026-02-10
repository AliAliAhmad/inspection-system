"""
Work Plan AI Service - AI-powered work planning intelligence.
Provides auto-scheduling, predictions, anomaly detection, optimization, and natural language processing.
"""

import logging
import statistics
import json
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from functools import lru_cache

from sqlalchemy import func, and_, or_, desc

from app.extensions import db
from app.models import (
    User, Equipment, Defect, Inspection, InspectionAssignment, Leave
)
from app.models.work_plan import WorkPlan
from app.models.work_plan_day import WorkPlanDay
from app.models.work_plan_job import WorkPlanJob
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.work_plan_performance import WorkPlanPerformance
from app.models.work_plan_job_rating import WorkPlanJobRating
from app.models.work_plan_carry_over import WorkPlanCarryOver
from app.services.openai_service import ReportService, VisionService

logger = logging.getLogger(__name__)


class WorkPlanAIService:
    """AI-powered work planning intelligence."""

    def __init__(self):
        """Initialize the AI service."""
        self.openai_service = ReportService()
        self.vision_service = VisionService()

    # ========================================
    # AUTO-SCHEDULING
    # ========================================

    def auto_schedule_jobs(self, plan_id: int, options: dict = None) -> dict:
        """
        AI-optimized job distribution across days and workers.

        Args:
            plan_id: Work plan ID
            options: {
                priority_weight: float (0-1) - Weight for job priority in scheduling
                balance_berths: bool - Balance jobs across east/west berths
                consider_skills: bool - Match jobs to worker specializations
                minimize_travel: bool - Group jobs by equipment location
            }

        Returns:
            {
                scheduled: List of scheduled jobs,
                conflicts: List of scheduling conflicts,
                optimization_score: 0-100 score
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found', 'scheduled': [], 'conflicts': [], 'optimization_score': 0}

        options = options or {}
        priority_weight = options.get('priority_weight', 0.5)
        balance_berths = options.get('balance_berths', True)
        consider_skills = options.get('consider_skills', True)
        minimize_travel = options.get('minimize_travel', True)

        scheduled = []
        conflicts = []

        # Get all jobs that need scheduling
        unassigned_jobs = []
        for day in plan.days:
            for job in day.jobs:
                if not job.assignments:
                    unassigned_jobs.append(job)

        if not unassigned_jobs:
            return {
                'scheduled': [],
                'conflicts': [],
                'optimization_score': 100,
                'message': 'All jobs are already assigned'
            }

        # Get available workers
        available_workers = User.query.filter(
            User.is_active == True,
            User.is_on_leave == False,
            User.role.in_(['specialist', 'engineer'])
        ).all()

        if not available_workers:
            return {
                'error': 'No available workers',
                'scheduled': [],
                'conflicts': [{'type': 'no_workers', 'description': 'No available workers for scheduling'}],
                'optimization_score': 0
            }

        # Build worker availability by day
        worker_hours_per_day = defaultdict(lambda: defaultdict(float))  # {day_id: {user_id: hours_assigned}}
        daily_capacity = 8.0  # 8 hours per day per worker

        # Track existing assignments
        for day in plan.days:
            for job in day.jobs:
                for assignment in job.assignments:
                    worker_hours_per_day[day.id][assignment.user_id] += job.estimated_hours or 0

        # Score and sort jobs by priority
        def job_priority_score(job: WorkPlanJob) -> float:
            score = 0.0
            # Priority weight
            priority_map = {'urgent': 4, 'high': 3, 'normal': 2, 'low': 1}
            score += priority_map.get(job.priority, 2) * priority_weight * 25

            # Overdue weight
            if job.overdue_value and job.overdue_value > 0:
                if job.computed_priority == 'critical':
                    score += 50
                elif job.computed_priority == 'high':
                    score += 30

            # Defect jobs are prioritized
            if job.job_type == 'defect':
                score += 20

            return score

        unassigned_jobs.sort(key=job_priority_score, reverse=True)

        # Schedule each job
        for job in unassigned_jobs:
            best_worker = None
            best_score = -1

            for worker in available_workers:
                day_id = job.work_plan_day_id
                current_hours = worker_hours_per_day[day_id][worker.id]

                # Check capacity
                if current_hours + (job.estimated_hours or 0) > daily_capacity:
                    continue

                score = 100.0

                # Skill matching
                if consider_skills and job.equipment:
                    # Match specialization
                    if worker.specialization:
                        # Check if equipment type matches specialization
                        eq_type = job.equipment.equipment_type or ''
                        if 'electrical' in eq_type.lower() and worker.specialization == 'electrical':
                            score += 20
                        elif 'mechanical' in eq_type.lower() and worker.specialization == 'mechanical':
                            score += 20
                        elif 'hvac' in eq_type.lower() and worker.specialization == 'hvac':
                            score += 20

                # Berth preference
                if balance_berths and job.berth:
                    # Check if worker is already assigned to same berth jobs today
                    same_berth_count = 0
                    day_jobs = WorkPlanJob.query.filter_by(work_plan_day_id=day_id).all()
                    for dj in day_jobs:
                        for a in dj.assignments:
                            if a.user_id == worker.id and dj.berth == job.berth:
                                same_berth_count += 1
                    if same_berth_count > 0:
                        score += 10 * min(same_berth_count, 3)  # Reward same berth continuity

                # Travel minimization
                if minimize_travel and job.equipment:
                    # Check if worker has other jobs on same equipment
                    same_equipment_count = 0
                    for dj in day_jobs:
                        for a in dj.assignments:
                            if a.user_id == worker.id and dj.equipment_id == job.equipment_id:
                                same_equipment_count += 1
                    if same_equipment_count > 0:
                        score += 15

                # Prefer workers with less load
                load_factor = 1 - (current_hours / daily_capacity)
                score += load_factor * 20

                if score > best_score:
                    best_score = score
                    best_worker = worker

            if best_worker:
                # Create assignment
                scheduled.append({
                    'job_id': job.id,
                    'user_id': best_worker.id,
                    'user_name': best_worker.full_name,
                    'day_date': job.day.date.isoformat() if job.day else None,
                    'equipment_name': job.equipment.name if job.equipment else None,
                    'estimated_hours': job.estimated_hours,
                    'score': round(best_score, 2)
                })

                # Update tracking
                worker_hours_per_day[job.work_plan_day_id][best_worker.id] += job.estimated_hours or 0
            else:
                conflicts.append({
                    'type': 'no_available_worker',
                    'job_id': job.id,
                    'description': f'No worker available for job {job.id} on day {job.day.date if job.day else "unknown"}',
                    'estimated_hours': job.estimated_hours
                })

        # Calculate optimization score
        total_jobs = len(unassigned_jobs)
        scheduled_count = len(scheduled)
        optimization_score = (scheduled_count / total_jobs * 100) if total_jobs > 0 else 100

        return {
            'scheduled': scheduled,
            'conflicts': conflicts,
            'optimization_score': round(optimization_score, 1),
            'total_jobs': total_jobs,
            'jobs_scheduled': scheduled_count,
            'jobs_with_conflicts': len(conflicts)
        }

    def suggest_optimal_team(self, job_id: int) -> list:
        """
        Suggest best team for a job based on skills, history, and availability.

        Args:
            job_id: Work plan job ID

        Returns:
            List of suggested workers with scores and reasons
        """
        job = db.session.get(WorkPlanJob, job_id)
        if not job:
            return []

        suggestions = []

        # Get available workers
        workers = User.query.filter(
            User.is_active == True,
            User.is_on_leave == False,
            User.role.in_(['specialist', 'engineer', 'inspector'])
        ).all()

        for worker in workers:
            score = 50.0
            reasons = []
            past_performance = None

            # Check specialization match
            if job.equipment and worker.specialization:
                eq_type = (job.equipment.equipment_type or '').lower()
                if worker.specialization == 'electrical' and 'electrical' in eq_type:
                    score += 20
                    reasons.append('Specialization matches equipment type')
                elif worker.specialization == 'mechanical' and 'mechanical' in eq_type:
                    score += 20
                    reasons.append('Specialization matches equipment type')
                elif worker.specialization == 'hvac' and 'hvac' in eq_type:
                    score += 20
                    reasons.append('Specialization matches equipment type')

            # Check availability on job day
            if job.day:
                job_date = job.day.date
                # Check if worker has leave on that day
                leave = Leave.query.filter(
                    Leave.user_id == worker.id,
                    Leave.status == 'approved',
                    Leave.start_date <= job_date,
                    Leave.end_date >= job_date
                ).first()
                if leave:
                    score -= 100  # Not available
                    reasons.append('On leave that day')
                else:
                    score += 10
                    reasons.append('Available on scheduled day')

            # Check past performance on similar equipment
            if job.equipment:
                similar_jobs_completed = db.session.query(WorkPlanJobTracking).join(
                    WorkPlanJob
                ).join(
                    WorkPlanAssignment
                ).filter(
                    WorkPlanAssignment.user_id == worker.id,
                    WorkPlanJob.equipment_id == job.equipment_id,
                    WorkPlanJobTracking.status == 'completed'
                ).count()

                if similar_jobs_completed > 0:
                    score += min(similar_jobs_completed * 5, 25)
                    reasons.append(f'Completed {similar_jobs_completed} similar jobs on this equipment')

                # Get average rating on similar jobs
                avg_rating = db.session.query(
                    func.avg(WorkPlanJobRating.qc_rating)
                ).join(
                    WorkPlanJob
                ).filter(
                    WorkPlanJobRating.user_id == worker.id,
                    WorkPlanJob.equipment_id == job.equipment_id
                ).scalar()

                if avg_rating:
                    past_performance = float(avg_rating)
                    if avg_rating >= 4.0:
                        score += 15
                        reasons.append(f'High rating ({avg_rating:.1f}) on similar equipment')
                    elif avg_rating >= 3.0:
                        score += 5
                        reasons.append(f'Good rating ({avg_rating:.1f}) on similar equipment')

            # Check current workload
            if job.day:
                current_assigned_hours = db.session.query(
                    func.sum(WorkPlanJob.estimated_hours)
                ).join(
                    WorkPlanAssignment
                ).filter(
                    WorkPlanAssignment.user_id == worker.id,
                    WorkPlanJob.work_plan_day_id == job.work_plan_day_id
                ).scalar() or 0

                if current_assigned_hours < 4:
                    score += 10
                    reasons.append(f'Light workload ({current_assigned_hours}h assigned)')
                elif current_assigned_hours > 7:
                    score -= 20
                    reasons.append(f'Heavy workload ({current_assigned_hours}h assigned)')

            if score > 0:
                suggestions.append({
                    'user_id': worker.id,
                    'full_name': worker.full_name,
                    'role': worker.role,
                    'specialization': worker.specialization,
                    'score': round(score, 1),
                    'reasons': reasons,
                    'past_performance_on_similar': past_performance
                })

        # Sort by score
        suggestions.sort(key=lambda x: x['score'], reverse=True)

        return suggestions[:10]  # Return top 10 suggestions

    def optimize_job_sequence(self, day_id: int, user_id: int) -> list:
        """
        Determine optimal order for worker's daily jobs.

        Args:
            day_id: Work plan day ID
            user_id: Worker user ID

        Returns:
            List of jobs with suggested order, start times, and reasons
        """
        # Get all jobs assigned to this worker on this day
        jobs = db.session.query(WorkPlanJob).join(
            WorkPlanAssignment
        ).filter(
            WorkPlanJob.work_plan_day_id == day_id,
            WorkPlanAssignment.user_id == user_id
        ).all()

        if not jobs:
            return []

        # Score each job for ordering
        job_data = []
        for job in jobs:
            data = {
                'job_id': job.id,
                'equipment_id': job.equipment_id,
                'equipment_name': job.equipment.name if job.equipment else None,
                'berth': job.berth,
                'priority': job.priority,
                'computed_priority': job.computed_priority,
                'estimated_hours': job.estimated_hours or 1.0,
                'job_type': job.job_type,
                'equipment_location': job.equipment.berth if job.equipment else job.berth
            }

            # Calculate priority score for ordering
            priority_score = 0
            if job.computed_priority == 'critical':
                priority_score = 100
            elif job.computed_priority == 'high':
                priority_score = 75
            elif job.priority == 'urgent':
                priority_score = 90
            elif job.priority == 'high':
                priority_score = 60
            elif job.priority == 'normal':
                priority_score = 40
            else:
                priority_score = 20

            # Defect jobs get priority boost
            if job.job_type == 'defect':
                priority_score += 15

            data['priority_score'] = priority_score
            job_data.append(data)

        # Sort by priority first
        job_data.sort(key=lambda x: x['priority_score'], reverse=True)

        # Optimize for travel - group by location/berth
        optimized = []
        remaining = list(job_data)
        current_berth = None
        current_time = datetime.combine(date.today(), datetime.min.time()).replace(hour=7, minute=0)

        while remaining:
            # Find best next job
            best_job = None
            best_score = -1

            for job in remaining:
                score = job['priority_score']

                # Same berth continuity bonus
                if current_berth and job.get('equipment_location') == current_berth:
                    score += 30

                # Same equipment bonus (reduces setup time)
                if optimized:
                    last_job = optimized[-1]
                    if job['equipment_id'] and job['equipment_id'] == last_job['equipment_id']:
                        score += 40

                if score > best_score:
                    best_score = score
                    best_job = job

            if best_job:
                remaining.remove(best_job)
                best_job['suggested_order'] = len(optimized) + 1
                best_job['start_time'] = current_time.strftime('%H:%M')

                # Build reason
                reasons = []
                if best_job['computed_priority'] in ('critical', 'high'):
                    reasons.append(f'{best_job["computed_priority"]} priority')
                if optimized and best_job.get('equipment_location') == current_berth:
                    reasons.append('Same berth as previous job')
                if optimized and best_job['equipment_id'] == optimized[-1]['equipment_id']:
                    reasons.append('Same equipment - no travel needed')

                best_job['reason'] = '; '.join(reasons) if reasons else 'Scheduled based on priority'

                optimized.append(best_job)
                current_berth = best_job.get('equipment_location')
                current_time += timedelta(hours=float(best_job['estimated_hours']))

        return optimized

    def balance_workload(self, plan_id: int) -> dict:
        """
        Rebalance jobs across workers for fairness.

        Args:
            plan_id: Work plan ID

        Returns:
            {
                moves: List of suggested job moves,
                improvement_score: How much this improves balance
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found', 'moves': [], 'improvement_score': 0}

        moves = []

        # Calculate current workload per worker per day
        worker_loads = defaultdict(lambda: defaultdict(float))  # {day_id: {user_id: hours}}
        worker_job_counts = defaultdict(lambda: defaultdict(int))  # {day_id: {user_id: job_count}}

        all_assignments = []
        for day in plan.days:
            for job in day.jobs:
                for assignment in job.assignments:
                    worker_loads[day.id][assignment.user_id] += job.estimated_hours or 0
                    worker_job_counts[day.id][assignment.user_id] += 1
                    all_assignments.append({
                        'day_id': day.id,
                        'day_date': day.date,
                        'job_id': job.id,
                        'job_hours': job.estimated_hours or 0,
                        'user_id': assignment.user_id,
                        'assignment_id': assignment.id
                    })

        if not all_assignments:
            return {'moves': [], 'improvement_score': 100, 'message': 'No assignments to balance'}

        # For each day, check balance
        original_imbalance = 0
        improved_imbalance = 0

        for day in plan.days:
            day_loads = worker_loads[day.id]
            if len(day_loads) < 2:
                continue

            loads = list(day_loads.values())
            if not loads:
                continue

            avg_load = statistics.mean(loads)
            if avg_load == 0:
                continue

            std_dev = statistics.stdev(loads) if len(loads) > 1 else 0
            original_imbalance += std_dev

            # Find overloaded and underloaded workers
            overloaded = [(uid, hrs) for uid, hrs in day_loads.items() if hrs > avg_load + 1]
            underloaded = [(uid, hrs) for uid, hrs in day_loads.items() if hrs < avg_load - 1]

            for over_uid, over_hrs in overloaded:
                for under_uid, under_hrs in underloaded:
                    # Find jobs that could be moved
                    movable_jobs = [
                        a for a in all_assignments
                        if a['day_id'] == day.id
                        and a['user_id'] == over_uid
                        and a['job_hours'] <= (over_hrs - avg_load + 0.5)  # Don't move too-big jobs
                    ]

                    for movable in movable_jobs[:1]:  # Move at most 1 job per pair
                        moves.append({
                            'job_id': movable['job_id'],
                            'from_user_id': over_uid,
                            'from_user_name': db.session.get(User, over_uid).full_name if db.session.get(User, over_uid) else 'Unknown',
                            'to_user_id': under_uid,
                            'to_user_name': db.session.get(User, under_uid).full_name if db.session.get(User, under_uid) else 'Unknown',
                            'day_date': movable['day_date'].isoformat() if movable['day_date'] else None,
                            'job_hours': movable['job_hours'],
                            'reason': f'Balancing workload: {over_uid} has {over_hrs:.1f}h, {under_uid} has {under_hrs:.1f}h'
                        })

                        # Update tracking for improved calculation
                        worker_loads[day.id][over_uid] -= movable['job_hours']
                        worker_loads[day.id][under_uid] += movable['job_hours']

        # Calculate improvement
        for day in plan.days:
            day_loads = worker_loads[day.id]
            if len(day_loads) > 1:
                loads = list(day_loads.values())
                if loads:
                    std_dev = statistics.stdev(loads) if len(loads) > 1 else 0
                    improved_imbalance += std_dev

        improvement_score = 0
        if original_imbalance > 0:
            improvement = (original_imbalance - improved_imbalance) / original_imbalance * 100
            improvement_score = max(0, min(100, improvement))

        return {
            'moves': moves,
            'improvement_score': round(improvement_score, 1),
            'original_imbalance': round(original_imbalance, 2),
            'improved_imbalance': round(improved_imbalance, 2)
        }

    # ========================================
    # PREDICTION
    # ========================================

    def predict_job_duration(self, job_data: dict) -> dict:
        """
        Predict actual duration based on historical data.

        Args:
            job_data: {
                equipment_id: int,
                job_type: str,
                team_size: int,
                worker_ids: list,
                weather_conditions: str (optional)
            }

        Returns:
            {
                estimated_hours: float,
                confidence: 0-1,
                range: {min: float, max: float},
                factors: list of influencing factors
            }
        """
        equipment_id = job_data.get('equipment_id')
        job_type = job_data.get('job_type', 'pm')
        team_size = job_data.get('team_size', 1)
        worker_ids = job_data.get('worker_ids', [])

        factors = []

        # Get historical data for similar jobs
        query = db.session.query(
            WorkPlanJobTracking.actual_hours,
            WorkPlanJob.estimated_hours
        ).join(
            WorkPlanJob
        ).filter(
            WorkPlanJobTracking.status == 'completed',
            WorkPlanJobTracking.actual_hours.isnot(None),
            WorkPlanJob.job_type == job_type
        )

        if equipment_id:
            query = query.filter(WorkPlanJob.equipment_id == equipment_id)
            factors.append('Equipment-specific history')

        historical = query.order_by(desc(WorkPlanJobTracking.completed_at)).limit(50).all()

        if not historical:
            # Fallback: get any historical data for this job type
            historical = db.session.query(
                WorkPlanJobTracking.actual_hours,
                WorkPlanJob.estimated_hours
            ).join(
                WorkPlanJob
            ).filter(
                WorkPlanJobTracking.status == 'completed',
                WorkPlanJobTracking.actual_hours.isnot(None),
                WorkPlanJob.job_type == job_type
            ).limit(100).all()
            factors.append('Job type historical average')

        if not historical:
            return {
                'estimated_hours': 2.0,
                'confidence': 0.3,
                'range': {'min': 1.0, 'max': 4.0},
                'factors': ['No historical data - using default estimate']
            }

        actual_hours = [float(h[0]) for h in historical if h[0]]
        estimated_hours = [float(h[1]) for h in historical if h[1]]

        if not actual_hours:
            return {
                'estimated_hours': 2.0,
                'confidence': 0.3,
                'range': {'min': 1.0, 'max': 4.0},
                'factors': ['No historical data - using default estimate']
            }

        # Calculate statistics
        avg_actual = statistics.mean(actual_hours)
        std_dev = statistics.stdev(actual_hours) if len(actual_hours) > 1 else avg_actual * 0.2

        # Calculate accuracy of estimates
        if estimated_hours:
            estimate_errors = [abs(a - e) / e for a, e in zip(actual_hours, estimated_hours) if e > 0]
            avg_error = statistics.mean(estimate_errors) if estimate_errors else 0.2
            factors.append(f'Historical estimate accuracy: {(1 - avg_error) * 100:.0f}%')

        # Adjust for team size
        if team_size > 1:
            # More workers = slightly faster (with diminishing returns)
            team_factor = 1 / (1 + 0.3 * (team_size - 1))
            avg_actual *= team_factor
            std_dev *= team_factor
            factors.append(f'Team size adjustment: {team_size} workers')

        # Check worker experience
        if worker_ids:
            # Get average performance of assigned workers
            worker_ratings = db.session.query(
                func.avg(WorkPlanJobRating.effective_time_rating)
            ).filter(
                WorkPlanJobRating.user_id.in_(worker_ids)
            ).scalar()

            if worker_ratings:
                rating = float(worker_ratings)
                # Higher rating = faster completion
                if rating >= 5:
                    avg_actual *= 0.9
                    factors.append(f'Experienced workers (avg rating: {rating:.1f})')
                elif rating < 3:
                    avg_actual *= 1.1
                    factors.append(f'Less experienced workers (avg rating: {rating:.1f})')

        # Confidence based on data quality
        confidence = min(0.95, 0.5 + len(historical) * 0.01)

        return {
            'estimated_hours': round(avg_actual, 2),
            'confidence': round(confidence, 2),
            'range': {
                'min': round(max(0.5, avg_actual - std_dev), 2),
                'max': round(avg_actual + std_dev, 2)
            },
            'factors': factors,
            'sample_size': len(historical)
        }

    def predict_delay_risk(self, job_id: int) -> dict:
        """
        Predict likelihood of job being delayed.

        Args:
            job_id: Work plan job ID

        Returns:
            {
                risk_level: 'low'|'medium'|'high'|'critical',
                probability: 0-1,
                factors: list of risk factors,
                mitigation_suggestions: list
            }
        """
        job = db.session.get(WorkPlanJob, job_id)
        if not job:
            return {'error': 'Job not found'}

        risk_score = 0
        factors = []
        mitigation_suggestions = []

        # Factor 1: Job type
        if job.job_type == 'defect':
            risk_score += 10
            factors.append('Defect repairs often have unknown scope')
            mitigation_suggestions.append('Have spare parts ready')

        # Factor 2: Overdue status
        if job.overdue_value and job.overdue_value > 0:
            if job.computed_priority == 'critical':
                risk_score += 25
                factors.append(f'Critically overdue by {job.overdue_value} {job.overdue_unit}')
            elif job.computed_priority == 'high':
                risk_score += 15
                factors.append(f'Overdue by {job.overdue_value} {job.overdue_unit}')
            mitigation_suggestions.append('Prioritize this job in daily schedule')

        # Factor 3: Equipment history
        if job.equipment_id:
            # Check if this equipment typically has delays
            equipment_job_count = db.session.query(func.count(WorkPlanJob.id)).filter(
                WorkPlanJob.equipment_id == job.equipment_id
            ).scalar() or 0

            delayed_count = db.session.query(func.count(WorkPlanJobTracking.id)).join(
                WorkPlanJob
            ).filter(
                WorkPlanJob.equipment_id == job.equipment_id,
                WorkPlanJobTracking.actual_hours > WorkPlanJob.estimated_hours * 1.5
            ).scalar() or 0

            if equipment_job_count > 0:
                delay_rate = delayed_count / equipment_job_count
                if delay_rate > 0.3:
                    risk_score += 20
                    factors.append(f'Equipment has high delay history ({delay_rate * 100:.0f}% of jobs delayed)')
                    mitigation_suggestions.append('Allocate extra time buffer for this equipment')

        # Factor 4: Worker availability
        if job.assignments:
            for assignment in job.assignments:
                worker = assignment.user
                if worker and worker.is_on_leave:
                    risk_score += 30
                    factors.append(f'Assigned worker {worker.full_name} is on leave')
                    mitigation_suggestions.append('Reassign to available worker')
        else:
            risk_score += 20
            factors.append('No workers assigned yet')
            mitigation_suggestions.append('Assign workers as soon as possible')

        # Factor 5: Materials readiness
        if job.materials:
            for material in job.materials:
                if material.material and material.material.is_low_stock():
                    risk_score += 15
                    factors.append(f'Material {material.material.name} is low in stock')
                    mitigation_suggestions.append('Verify material availability before starting')

        # Factor 6: Complex PM templates
        if job.pm_template:
            # More items = more risk
            item_count = len(job.pm_template.items) if hasattr(job.pm_template, 'items') else 0
            if item_count > 20:
                risk_score += 10
                factors.append(f'Complex PM with {item_count} checklist items')

        # Factor 7: Weather (if outdoor equipment)
        if job.equipment and job.equipment.berth:
            # Outdoor equipment more susceptible to delays
            risk_score += 5
            factors.append('Outdoor equipment - weather may affect schedule')

        # Calculate risk level
        if risk_score >= 60:
            risk_level = 'critical'
            probability = min(0.95, 0.7 + risk_score / 200)
        elif risk_score >= 40:
            risk_level = 'high'
            probability = min(0.7, 0.4 + risk_score / 200)
        elif risk_score >= 20:
            risk_level = 'medium'
            probability = min(0.4, 0.2 + risk_score / 200)
        else:
            risk_level = 'low'
            probability = max(0.05, risk_score / 200)

        return {
            'job_id': job_id,
            'risk_level': risk_level,
            'probability': round(probability, 2),
            'risk_score': risk_score,
            'factors': factors,
            'mitigation_suggestions': mitigation_suggestions[:5]
        }

    def predict_completion_rate(self, plan_id: int) -> dict:
        """
        Predict plan completion percentage.

        Args:
            plan_id: Work plan ID

        Returns:
            {
                predicted_rate: 0-100,
                confidence: 0-1,
                at_risk_jobs: list of at-risk job IDs,
                recommendations: list
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        total_jobs = 0
        at_risk_jobs = []
        predicted_completed = 0
        recommendations = []

        for day in plan.days:
            for job in day.jobs:
                total_jobs += 1

                # Get delay risk
                risk = self.predict_delay_risk(job.id)
                risk_level = risk.get('risk_level', 'low')

                if risk_level == 'critical':
                    at_risk_jobs.append({
                        'job_id': job.id,
                        'equipment': job.equipment.name if job.equipment else 'N/A',
                        'risk_level': risk_level,
                        'factors': risk.get('factors', [])[:2]
                    })
                    predicted_completed += 0.3
                elif risk_level == 'high':
                    at_risk_jobs.append({
                        'job_id': job.id,
                        'equipment': job.equipment.name if job.equipment else 'N/A',
                        'risk_level': risk_level,
                        'factors': risk.get('factors', [])[:2]
                    })
                    predicted_completed += 0.6
                elif risk_level == 'medium':
                    predicted_completed += 0.85
                else:
                    predicted_completed += 0.95

        if total_jobs == 0:
            return {
                'predicted_rate': 100,
                'confidence': 0.5,
                'at_risk_jobs': [],
                'recommendations': ['No jobs in plan']
            }

        predicted_rate = (predicted_completed / total_jobs) * 100

        # Get historical completion rate for similar time periods
        historical_rates = db.session.query(
            func.count(WorkPlanJobTracking.id).filter(
                WorkPlanJobTracking.status == 'completed'
            ).label('completed'),
            func.count(WorkPlanJobTracking.id).label('total')
        ).join(
            WorkPlanJob
        ).join(
            WorkPlanDay
        ).join(
            WorkPlan
        ).filter(
            WorkPlan.status == 'published'
        ).first()

        confidence = 0.7
        if historical_rates and historical_rates.total > 0:
            historical_rate = historical_rates.completed / historical_rates.total * 100
            # Adjust prediction based on historical
            predicted_rate = (predicted_rate + historical_rate) / 2
            confidence = 0.85

        # Generate recommendations
        if len(at_risk_jobs) > 0:
            recommendations.append(f'{len(at_risk_jobs)} jobs have elevated delay risk - review assignments')

        if predicted_rate < 80:
            recommendations.append('Consider reducing workload or adding workers')

        unassigned = sum(1 for day in plan.days for job in day.jobs if not job.assignments)
        if unassigned > 0:
            recommendations.append(f'{unassigned} jobs are not yet assigned')

        return {
            'predicted_rate': round(predicted_rate, 1),
            'confidence': round(confidence, 2),
            'at_risk_jobs': at_risk_jobs[:10],
            'total_jobs': total_jobs,
            'at_risk_count': len(at_risk_jobs),
            'recommendations': recommendations
        }

    def forecast_workload(self, weeks_ahead: int = 4) -> list:
        """
        Forecast upcoming workload based on PM schedules and defect trends.

        Args:
            weeks_ahead: Number of weeks to forecast

        Returns:
            List of weekly forecasts with predicted jobs and hours
        """
        forecasts = []
        today = date.today()

        for week_offset in range(weeks_ahead):
            week_start = today + timedelta(weeks=week_offset)
            # Adjust to Monday
            week_start = week_start - timedelta(days=week_start.weekday())
            week_end = week_start + timedelta(days=6)

            # Count scheduled PM jobs (from maintenance cycles)
            # This would integrate with PM scheduling system
            predicted_pm_jobs = 0
            predicted_pm_hours = 0.0

            # Get historical average jobs per week
            historical_weeks = db.session.query(
                WorkPlan.id,
                func.count(WorkPlanJob.id).label('job_count'),
                func.sum(WorkPlanJob.estimated_hours).label('total_hours')
            ).join(
                WorkPlanDay
            ).join(
                WorkPlanJob
            ).filter(
                WorkPlan.status == 'published'
            ).group_by(
                WorkPlan.id
            ).all()

            if historical_weeks:
                avg_jobs = statistics.mean([h.job_count for h in historical_weeks])
                avg_hours = statistics.mean([float(h.total_hours or 0) for h in historical_weeks])
            else:
                avg_jobs = 20
                avg_hours = 80

            # Predict defect jobs based on trend
            last_month_defects = Defect.query.filter(
                Defect.created_at >= today - timedelta(days=30),
                Defect.status.in_(['open', 'in_progress'])
            ).count()

            predicted_defect_jobs = int(last_month_defects / 4 * (1 + week_offset * 0.1))

            # Total prediction
            predicted_jobs = int(avg_jobs + predicted_defect_jobs * 0.3)
            predicted_hours = avg_hours + predicted_defect_jobs * 2

            # Confidence decreases with distance
            confidence = max(0.4, 0.9 - week_offset * 0.1)

            forecasts.append({
                'week_start': week_start.isoformat(),
                'week_end': week_end.isoformat(),
                'predicted_jobs': predicted_jobs,
                'predicted_hours': round(predicted_hours, 1),
                'predicted_pm_jobs': int(avg_jobs * 0.7),
                'predicted_defect_jobs': predicted_defect_jobs,
                'confidence': round(confidence, 2)
            })

        return forecasts

    # ========================================
    # ANOMALY DETECTION
    # ========================================

    def detect_schedule_anomalies(self, plan_id: int) -> list:
        """
        Find unusual patterns in schedule.

        Args:
            plan_id: Work plan ID

        Returns:
            List of anomalies with type, description, severity, and suggestions
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return []

        anomalies = []

        # Anomaly 1: Unbalanced workload across days
        daily_hours = {}
        for day in plan.days:
            hours = sum(job.estimated_hours or 0 for job in day.jobs)
            daily_hours[day.date] = hours

        if daily_hours:
            avg_hours = statistics.mean(daily_hours.values())
            for day_date, hours in daily_hours.items():
                if avg_hours > 0 and hours > avg_hours * 1.5:
                    anomalies.append({
                        'type': 'unbalanced_day',
                        'description': f'{day_date} has {hours:.1f}h scheduled vs {avg_hours:.1f}h average',
                        'severity': 'medium',
                        'affected_items': [day_date.isoformat()],
                        'suggestion': 'Consider redistributing jobs to other days'
                    })
                elif avg_hours > 0 and hours < avg_hours * 0.5:
                    anomalies.append({
                        'type': 'light_day',
                        'description': f'{day_date} has only {hours:.1f}h scheduled vs {avg_hours:.1f}h average',
                        'severity': 'low',
                        'affected_items': [day_date.isoformat()],
                        'suggestion': 'This day has capacity for more jobs'
                    })

        # Anomaly 2: Worker overloaded
        worker_hours = defaultdict(float)
        for day in plan.days:
            for job in day.jobs:
                for assignment in job.assignments:
                    worker_hours[assignment.user_id] += job.estimated_hours or 0

        for user_id, hours in worker_hours.items():
            if hours > 45:  # More than 45 hours in a week
                user = db.session.get(User, user_id)
                anomalies.append({
                    'type': 'worker_overloaded',
                    'description': f'{user.full_name if user else "Worker"} has {hours:.1f}h scheduled this week',
                    'severity': 'high',
                    'affected_items': [user_id],
                    'suggestion': 'Redistribute some jobs to other workers'
                })

        # Anomaly 3: Jobs without assignments
        unassigned_count = 0
        for day in plan.days:
            for job in day.jobs:
                if not job.assignments:
                    unassigned_count += 1

        if unassigned_count > 0:
            anomalies.append({
                'type': 'unassigned_jobs',
                'description': f'{unassigned_count} jobs have no workers assigned',
                'severity': 'high',
                'affected_items': [],
                'suggestion': 'Use auto-schedule or manually assign workers'
            })

        # Anomaly 4: Same equipment scheduled multiple times same day
        for day in plan.days:
            equipment_jobs = defaultdict(list)
            for job in day.jobs:
                if job.equipment_id:
                    equipment_jobs[job.equipment_id].append(job.id)

            for eq_id, job_ids in equipment_jobs.items():
                if len(job_ids) > 2:
                    eq = db.session.get(Equipment, eq_id)
                    anomalies.append({
                        'type': 'duplicate_equipment',
                        'description': f'{eq.name if eq else "Equipment"} has {len(job_ids)} jobs on {day.date}',
                        'severity': 'low',
                        'affected_items': job_ids,
                        'suggestion': 'Consider consolidating into fewer jobs or spreading across days'
                    })

        # Anomaly 5: High priority jobs scheduled late in week
        for day in plan.days:
            # Check if it's Thursday or Friday
            if day.date.weekday() >= 3:  # Thursday = 3, Friday = 4
                critical_jobs = [j for j in day.jobs if j.computed_priority in ('critical', 'high')]
                if critical_jobs:
                    anomalies.append({
                        'type': 'critical_job_late_week',
                        'description': f'{len(critical_jobs)} critical/high priority jobs scheduled for {day.date.strftime("%A")}',
                        'severity': 'medium',
                        'affected_items': [j.id for j in critical_jobs],
                        'suggestion': 'Consider moving critical jobs earlier in the week'
                    })

        return anomalies

    def detect_performance_anomalies(self, user_id: int = None, period: str = 'weekly') -> list:
        """
        Detect unusual worker performance patterns.

        Args:
            user_id: Optional specific user to analyze
            period: 'daily', 'weekly', or 'monthly'

        Returns:
            List of performance anomalies
        """
        anomalies = []

        # Determine date range
        today = date.today()
        if period == 'daily':
            period_start = today - timedelta(days=1)
        elif period == 'weekly':
            period_start = today - timedelta(days=7)
        else:  # monthly
            period_start = today - timedelta(days=30)

        # Build user query
        if user_id:
            users = [db.session.get(User, user_id)]
        else:
            users = User.query.filter(
                User.is_active == True,
                User.role.in_(['specialist', 'engineer', 'inspector'])
            ).all()

        for user in users:
            if not user:
                continue

            # Get recent performance data
            completed_jobs = db.session.query(WorkPlanJobTracking).join(
                WorkPlanJob
            ).join(
                WorkPlanAssignment
            ).join(
                WorkPlanDay
            ).filter(
                WorkPlanAssignment.user_id == user.id,
                WorkPlanJobTracking.status == 'completed',
                WorkPlanDay.date >= period_start
            ).all()

            if len(completed_jobs) < 3:
                continue

            # Check time efficiency
            time_ratios = []
            for tracking in completed_jobs:
                job = tracking.work_plan_job
                if job.estimated_hours and tracking.actual_hours:
                    ratio = float(tracking.actual_hours) / float(job.estimated_hours)
                    time_ratios.append(ratio)

            if time_ratios:
                avg_ratio = statistics.mean(time_ratios)

                # Anomaly: Consistently taking much longer
                if avg_ratio > 1.5:
                    anomalies.append({
                        'user_id': user.id,
                        'user_name': user.full_name,
                        'anomaly_type': 'slow_completion',
                        'description': f'Taking {(avg_ratio - 1) * 100:.0f}% longer than estimated on average',
                        'deviation': round(avg_ratio, 2),
                        'investigation_needed': avg_ratio > 2.0
                    })

                # Anomaly: Consistently much faster (possible quality issue)
                if avg_ratio < 0.6:
                    anomalies.append({
                        'user_id': user.id,
                        'user_name': user.full_name,
                        'anomaly_type': 'unusually_fast',
                        'description': f'Completing jobs {(1 - avg_ratio) * 100:.0f}% faster than estimated',
                        'deviation': round(avg_ratio, 2),
                        'investigation_needed': True
                    })

            # Check completion rate
            total_assigned = db.session.query(WorkPlanAssignment).join(
                WorkPlanJob
            ).join(
                WorkPlanDay
            ).filter(
                WorkPlanAssignment.user_id == user.id,
                WorkPlanDay.date >= period_start
            ).count()

            if total_assigned > 5:
                completion_rate = len(completed_jobs) / total_assigned

                if completion_rate < 0.6:
                    anomalies.append({
                        'user_id': user.id,
                        'user_name': user.full_name,
                        'anomaly_type': 'low_completion_rate',
                        'description': f'Only {completion_rate * 100:.0f}% of assigned jobs completed',
                        'deviation': round(completion_rate, 2),
                        'investigation_needed': completion_rate < 0.5
                    })

            # Check pause patterns
            total_pauses = sum(1 for t in completed_jobs if t.total_paused_minutes and t.total_paused_minutes > 30)
            if total_pauses > len(completed_jobs) * 0.5:
                anomalies.append({
                    'user_id': user.id,
                    'user_name': user.full_name,
                    'anomaly_type': 'frequent_pauses',
                    'description': f'{total_pauses} of {len(completed_jobs)} jobs had significant pauses',
                    'deviation': round(total_pauses / len(completed_jobs), 2),
                    'investigation_needed': False
                })

        return anomalies

    def detect_time_estimation_issues(self) -> list:
        """
        Find jobs where time estimates are consistently wrong.

        Returns:
            List of job types/equipment with estimation issues
        """
        issues = []

        # Analyze by job type
        job_types = ['pm', 'defect', 'inspection']

        for job_type in job_types:
            results = db.session.query(
                func.avg(WorkPlanJob.estimated_hours).label('avg_estimate'),
                func.avg(WorkPlanJobTracking.actual_hours).label('avg_actual'),
                func.count(WorkPlanJob.id).label('count')
            ).join(
                WorkPlanJobTracking
            ).filter(
                WorkPlanJob.job_type == job_type,
                WorkPlanJobTracking.status == 'completed',
                WorkPlanJob.estimated_hours.isnot(None),
                WorkPlanJobTracking.actual_hours.isnot(None)
            ).first()

            if results and results.count and results.count > 10:
                avg_estimate = float(results.avg_estimate or 0)
                avg_actual = float(results.avg_actual or 0)

                if avg_estimate > 0:
                    error_rate = abs(avg_actual - avg_estimate) / avg_estimate

                    if error_rate > 0.3:
                        issues.append({
                            'job_type': job_type,
                            'equipment_type': None,
                            'avg_estimate': round(avg_estimate, 2),
                            'avg_actual': round(avg_actual, 2),
                            'error_rate': round(error_rate * 100, 1),
                            'sample_size': results.count,
                            'recommendation': f'Adjust estimates by {(avg_actual / avg_estimate - 1) * 100:+.0f}%' if avg_estimate > 0 else 'Review estimation method'
                        })

        # Analyze by equipment type
        equipment_types = db.session.query(
            Equipment.equipment_type
        ).distinct().all()

        for (eq_type,) in equipment_types:
            if not eq_type:
                continue

            results = db.session.query(
                func.avg(WorkPlanJob.estimated_hours).label('avg_estimate'),
                func.avg(WorkPlanJobTracking.actual_hours).label('avg_actual'),
                func.count(WorkPlanJob.id).label('count')
            ).join(
                WorkPlanJobTracking
            ).join(
                Equipment
            ).filter(
                Equipment.equipment_type == eq_type,
                WorkPlanJobTracking.status == 'completed',
                WorkPlanJob.estimated_hours.isnot(None),
                WorkPlanJobTracking.actual_hours.isnot(None)
            ).first()

            if results and results.count and results.count > 5:
                avg_estimate = float(results.avg_estimate or 0)
                avg_actual = float(results.avg_actual or 0)

                if avg_estimate > 0:
                    error_rate = abs(avg_actual - avg_estimate) / avg_estimate

                    if error_rate > 0.35:
                        issues.append({
                            'job_type': None,
                            'equipment_type': eq_type,
                            'avg_estimate': round(avg_estimate, 2),
                            'avg_actual': round(avg_actual, 2),
                            'error_rate': round(error_rate * 100, 1),
                            'sample_size': results.count,
                            'recommendation': f'Adjust estimates for {eq_type} by {(avg_actual / avg_estimate - 1) * 100:+.0f}%'
                        })

        return sorted(issues, key=lambda x: x['error_rate'], reverse=True)

    # ========================================
    # OPTIMIZATION
    # ========================================

    def identify_bottlenecks(self, plan_id: int) -> list:
        """
        Find scheduling bottlenecks.

        Args:
            plan_id: Work plan ID

        Returns:
            List of bottlenecks with type, impact, and solutions
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return []

        bottlenecks = []

        # Bottleneck 1: Skill shortages
        skill_needs = defaultdict(int)
        for day in plan.days:
            for job in day.jobs:
                if job.equipment:
                    eq_type = (job.equipment.equipment_type or '').lower()
                    if 'electrical' in eq_type:
                        skill_needs['electrical'] += 1
                    elif 'mechanical' in eq_type:
                        skill_needs['mechanical'] += 1
                    elif 'hvac' in eq_type:
                        skill_needs['hvac'] += 1

        for skill, count in skill_needs.items():
            available = User.query.filter(
                User.is_active == True,
                User.is_on_leave == False,
                User.specialization == skill
            ).count()

            if count > available * 5:  # More than 5 jobs per specialist
                bottlenecks.append({
                    'type': 'skill_shortage',
                    'description': f'{count} {skill} jobs but only {available} specialists available',
                    'impact': 'high' if count > available * 8 else 'medium',
                    'affected_jobs': count,
                    'solution': f'Consider cross-training or hiring more {skill} specialists'
                })

        # Bottleneck 2: Equipment access conflicts
        for day in plan.days:
            equipment_times = defaultdict(list)
            for job in day.jobs:
                if job.equipment_id:
                    equipment_times[job.equipment_id].append({
                        'job_id': job.id,
                        'hours': job.estimated_hours or 0
                    })

            for eq_id, jobs in equipment_times.items():
                total_hours = sum(j['hours'] for j in jobs)
                if total_hours > 8:  # More than 8 hours on same equipment
                    eq = db.session.get(Equipment, eq_id)
                    bottlenecks.append({
                        'type': 'equipment_conflict',
                        'description': f'{eq.name if eq else "Equipment"} has {total_hours:.1f}h of work scheduled on {day.date}',
                        'impact': 'high' if total_hours > 12 else 'medium',
                        'affected_jobs': [j['job_id'] for j in jobs],
                        'solution': 'Spread jobs across multiple days or parallelize with multiple teams'
                    })

        # Bottleneck 3: Worker capacity
        worker_weekly_hours = defaultdict(float)
        for day in plan.days:
            for job in day.jobs:
                for assignment in job.assignments:
                    worker_weekly_hours[assignment.user_id] += job.estimated_hours or 0

        overloaded_workers = [
            (uid, hours) for uid, hours in worker_weekly_hours.items()
            if hours > 45
        ]

        if len(overloaded_workers) > len(worker_weekly_hours) * 0.3:
            bottlenecks.append({
                'type': 'capacity_constraint',
                'description': f'{len(overloaded_workers)} workers are overloaded (>45h/week)',
                'impact': 'high',
                'affected_jobs': [],
                'solution': 'Add more workers or reduce planned work'
            })

        # Bottleneck 4: Material shortages
        material_issues = []
        for day in plan.days:
            for job in day.jobs:
                for material in job.materials:
                    if material.material and material.material.current_stock < (material.quantity_required or 0):
                        material_issues.append({
                            'job_id': job.id,
                            'material': material.material.name,
                            'needed': material.quantity_required,
                            'available': material.material.current_stock
                        })

        if material_issues:
            bottlenecks.append({
                'type': 'material_shortage',
                'description': f'{len(material_issues)} jobs may be blocked by material shortages',
                'impact': 'high',
                'affected_jobs': [m['job_id'] for m in material_issues],
                'solution': 'Order materials urgently or reschedule affected jobs'
            })

        return bottlenecks

    def suggest_resource_optimization(self, plan_id: int) -> dict:
        """
        Minimize labor costs while meeting deadlines.

        Args:
            plan_id: Work plan ID

        Returns:
            {
                current_cost: estimated current labor cost,
                optimized_cost: optimized cost,
                savings: potential savings,
                changes: list of suggested changes
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        # Assume hourly rate for calculation
        hourly_rate = 50.0  # Base hourly rate

        # Calculate current costs
        current_hours = 0
        current_overtime_hours = 0
        worker_hours = defaultdict(float)

        for day in plan.days:
            for job in day.jobs:
                job_hours = job.estimated_hours or 0
                for assignment in job.assignments:
                    worker_hours[assignment.user_id] += job_hours
                    current_hours += job_hours

        # Calculate overtime (>8h per day is overtime)
        for worker_id, total_hours in worker_hours.items():
            if total_hours > 40:  # Weekly overtime
                current_overtime_hours += total_hours - 40

        current_cost = (current_hours * hourly_rate) + (current_overtime_hours * hourly_rate * 0.5)  # 1.5x for overtime

        # Optimize
        changes = []
        optimized_overtime = current_overtime_hours

        # Suggestion 1: Redistribute overtime to other workers
        underutilized = [
            (uid, hours) for uid, hours in worker_hours.items()
            if hours < 35
        ]
        overloaded = [
            (uid, hours) for uid, hours in worker_hours.items()
            if hours > 40
        ]

        for over_uid, over_hours in overloaded:
            excess = over_hours - 40
            for under_uid, under_hours in underutilized:
                capacity = 40 - under_hours
                transfer = min(excess, capacity)
                if transfer > 2:  # Only if significant
                    over_user = db.session.get(User, over_uid)
                    under_user = db.session.get(User, under_uid)
                    changes.append({
                        'type': 'redistribute_hours',
                        'description': f'Move {transfer:.1f}h from {over_user.full_name if over_user else "worker"} to {under_user.full_name if under_user else "worker"}',
                        'savings': round(transfer * hourly_rate * 0.5, 2)
                    })
                    optimized_overtime -= transfer

        # Suggestion 2: Identify jobs that could be deferred
        low_priority_hours = 0
        for day in plan.days:
            for job in day.jobs:
                if job.priority == 'low' and not job.overdue_value:
                    low_priority_hours += job.estimated_hours or 0

        if low_priority_hours > 5:
            changes.append({
                'type': 'defer_low_priority',
                'description': f'Consider deferring {low_priority_hours:.1f}h of low-priority jobs to next week',
                'savings': round(low_priority_hours * hourly_rate * 0.2, 2)  # 20% efficiency gain
            })

        optimized_cost = (current_hours * hourly_rate) + (optimized_overtime * hourly_rate * 0.5)
        savings = current_cost - optimized_cost

        return {
            'current_cost': round(current_cost, 2),
            'optimized_cost': round(optimized_cost, 2),
            'savings': round(savings, 2),
            'current_hours': round(current_hours, 1),
            'current_overtime_hours': round(current_overtime_hours, 1),
            'optimized_overtime_hours': round(optimized_overtime, 1),
            'changes': changes
        }

    def calculate_critical_path(self, plan_id: int) -> dict:
        """
        Find critical path considering job dependencies.

        Args:
            plan_id: Work plan ID

        Returns:
            {
                critical_jobs: list of jobs on critical path,
                total_duration: total critical path duration,
                slack_jobs: jobs with scheduling slack
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        critical_jobs = []
        slack_jobs = []

        # For work planning, critical path is based on:
        # 1. Overdue/urgent jobs
        # 2. Jobs with dependencies (same equipment must be sequential)
        # 3. Jobs with specific timing requirements

        # Identify critical jobs
        for day in plan.days:
            for job in day.jobs:
                is_critical = False
                reasons = []

                # Critical if overdue
                if job.overdue_value and job.overdue_value > 0:
                    is_critical = True
                    reasons.append('Overdue')

                # Critical if urgent priority
                if job.priority == 'urgent':
                    is_critical = True
                    reasons.append('Urgent priority')

                # Critical if defect with high severity
                if job.job_type == 'defect' and job.defect:
                    if job.defect.severity in ('critical', 'high'):
                        is_critical = True
                        reasons.append(f'{job.defect.severity} severity defect')

                # Critical if blocking other work
                if job.equipment_id:
                    same_equipment_jobs = [
                        j for d in plan.days for j in d.jobs
                        if j.equipment_id == job.equipment_id and j.id != job.id
                    ]
                    if len(same_equipment_jobs) > 2:
                        is_critical = True
                        reasons.append('Multiple jobs depend on this equipment')

                if is_critical:
                    critical_jobs.append({
                        'job_id': job.id,
                        'equipment': job.equipment.name if job.equipment else None,
                        'estimated_hours': job.estimated_hours,
                        'day': day.date.isoformat(),
                        'reasons': reasons
                    })
                else:
                    slack_jobs.append({
                        'job_id': job.id,
                        'equipment': job.equipment.name if job.equipment else None,
                        'estimated_hours': job.estimated_hours,
                        'day': day.date.isoformat(),
                        'slack_days': 1  # Could be rescheduled by 1 day
                    })

        # Calculate total critical duration
        total_duration = sum(j['estimated_hours'] or 0 for j in critical_jobs)

        return {
            'critical_jobs': critical_jobs,
            'total_duration': round(total_duration, 1),
            'critical_count': len(critical_jobs),
            'slack_jobs': slack_jobs,
            'slack_count': len(slack_jobs)
        }

    # ========================================
    # REAL-TIME INTELLIGENCE
    # ========================================

    def real_time_reschedule(self, trigger_event: dict) -> dict:
        """
        Auto-adjust schedule when delays or issues occur.

        Args:
            trigger_event: {
                event_type: 'delay'|'absence'|'emergency',
                affected_job_id: int (optional),
                affected_user_id: int (optional),
                details: str
            }

        Returns:
            {
                adjustments: list of schedule adjustments,
                notifications: list of notifications to send,
                impact_summary: summary of impact
            }
        """
        event_type = trigger_event.get('event_type')
        affected_job_id = trigger_event.get('affected_job_id')
        affected_user_id = trigger_event.get('affected_user_id')

        adjustments = []
        notifications = []
        impact_summary = {
            'jobs_affected': 0,
            'workers_affected': 0,
            'hours_impacted': 0
        }

        if event_type == 'delay' and affected_job_id:
            job = db.session.get(WorkPlanJob, affected_job_id)
            if job:
                # Find subsequent jobs that may be affected
                day = job.day
                if day:
                    subsequent_jobs = [
                        j for j in day.jobs
                        if j.position > job.position
                    ]

                    for subsequent in subsequent_jobs:
                        adjustments.append({
                            'type': 'delay_propagation',
                            'job_id': subsequent.id,
                            'action': 'Delay start time',
                            'reason': f'Delayed by job {job.id}'
                        })
                        impact_summary['jobs_affected'] += 1
                        impact_summary['hours_impacted'] += subsequent.estimated_hours or 0

                    # Notify affected workers
                    for subsequent in subsequent_jobs:
                        for assignment in subsequent.assignments:
                            notifications.append({
                                'user_id': assignment.user_id,
                                'message': f'Job {subsequent.id} may be delayed due to earlier delay',
                                'priority': 'warning'
                            })
                            impact_summary['workers_affected'] += 1

        elif event_type == 'absence' and affected_user_id:
            # Find all jobs assigned to absent worker
            today = date.today()
            affected_jobs = db.session.query(WorkPlanJob).join(
                WorkPlanAssignment
            ).join(
                WorkPlanDay
            ).filter(
                WorkPlanAssignment.user_id == affected_user_id,
                WorkPlanDay.date >= today
            ).all()

            user = db.session.get(User, affected_user_id)

            for job in affected_jobs:
                # Suggest reassignment
                suggestions = self.suggest_optimal_team(job.id)
                best_replacement = suggestions[0] if suggestions else None

                adjustments.append({
                    'type': 'reassignment_needed',
                    'job_id': job.id,
                    'action': 'Reassign to available worker',
                    'suggested_replacement': best_replacement['user_id'] if best_replacement else None,
                    'suggested_replacement_name': best_replacement['full_name'] if best_replacement else None,
                    'reason': f'Original assignee {user.full_name if user else "worker"} is absent'
                })
                impact_summary['jobs_affected'] += 1
                impact_summary['hours_impacted'] += job.estimated_hours or 0

            impact_summary['workers_affected'] = 1

        elif event_type == 'emergency':
            # Emergency: highest priority reschedule
            adjustments.append({
                'type': 'emergency_response',
                'action': 'All non-critical jobs should be paused',
                'reason': trigger_event.get('details', 'Emergency situation')
            })

            notifications.append({
                'user_id': None,  # Broadcast
                'message': f'Emergency: {trigger_event.get("details", "Check with supervisor")}',
                'priority': 'critical'
            })

        return {
            'adjustments': adjustments,
            'notifications': notifications,
            'impact_summary': impact_summary
        }

    def get_live_status_summary(self, plan_id: int) -> dict:
        """
        Real-time plan health dashboard.

        Args:
            plan_id: Work plan ID

        Returns:
            Plan health metrics and status
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        today = date.today()
        now = datetime.utcnow()

        total_jobs = 0
        completed_jobs = 0
        in_progress_jobs = 0
        delayed_jobs = 0
        at_risk_jobs = 0
        not_started_jobs = 0

        total_estimated_hours = 0
        total_actual_hours = 0

        recommendations = []

        for day in plan.days:
            for job in day.jobs:
                total_jobs += 1
                total_estimated_hours += job.estimated_hours or 0

                tracking = job.tracking
                if tracking:
                    if tracking.status == 'completed':
                        completed_jobs += 1
                        if tracking.actual_hours:
                            total_actual_hours += float(tracking.actual_hours)
                    elif tracking.status == 'in_progress':
                        in_progress_jobs += 1
                        # Check if delayed
                        if tracking.started_at:
                            elapsed = (now - tracking.started_at).total_seconds() / 3600
                            if elapsed > (job.estimated_hours or 0) * 1.5:
                                delayed_jobs += 1
                    elif tracking.status == 'paused':
                        at_risk_jobs += 1
                    else:
                        not_started_jobs += 1

                        # Check if should have started
                        if day.date < today:
                            at_risk_jobs += 1
                else:
                    not_started_jobs += 1
                    if day.date < today:
                        at_risk_jobs += 1

        # Calculate metrics
        on_track_jobs = completed_jobs + in_progress_jobs - delayed_jobs
        completion_rate = (completed_jobs / total_jobs * 100) if total_jobs > 0 else 0

        # Estimate completion time
        if completed_jobs > 0 and total_actual_hours > 0:
            avg_time_per_job = total_actual_hours / completed_jobs
            remaining_jobs = total_jobs - completed_jobs
            estimated_remaining_hours = remaining_jobs * avg_time_per_job
        else:
            estimated_remaining_hours = total_estimated_hours - total_actual_hours

        # Generate recommendations
        if delayed_jobs > 0:
            recommendations.append(f'{delayed_jobs} jobs are running behind schedule - consider adding resources')

        if at_risk_jobs > 3:
            recommendations.append(f'{at_risk_jobs} jobs at risk - review and prioritize')

        if completion_rate < 50 and today > plan.week_start + timedelta(days=3):
            recommendations.append('Completion rate below target - escalate to management')

        return {
            'plan_id': plan_id,
            'total_jobs': total_jobs,
            'completion_rate': round(completion_rate, 1),
            'completed_jobs': completed_jobs,
            'in_progress_jobs': in_progress_jobs,
            'on_track_jobs': on_track_jobs,
            'delayed_jobs': delayed_jobs,
            'at_risk_jobs': at_risk_jobs,
            'not_started_jobs': not_started_jobs,
            'total_estimated_hours': round(total_estimated_hours, 1),
            'total_actual_hours': round(total_actual_hours, 1),
            'estimated_remaining_hours': round(estimated_remaining_hours, 1),
            'recommendations': recommendations,
            'updated_at': now.isoformat()
        }

    # ========================================
    # ANALYTICS
    # ========================================

    def analyze_historical_performance(self, period: str = 'monthly') -> dict:
        """
        Analyze historical performance metrics.

        Args:
            period: 'weekly', 'monthly', or 'quarterly'

        Returns:
            Historical performance analysis
        """
        today = date.today()

        if period == 'weekly':
            period_start = today - timedelta(days=7)
        elif period == 'quarterly':
            period_start = today - timedelta(days=90)
        else:  # monthly
            period_start = today - timedelta(days=30)

        # Get completed jobs in period
        completed = db.session.query(
            WorkPlanJobTracking,
            WorkPlanJob
        ).join(
            WorkPlanJob
        ).join(
            WorkPlanDay
        ).filter(
            WorkPlanJobTracking.status == 'completed',
            WorkPlanDay.date >= period_start
        ).all()

        if not completed:
            return {
                'period': period,
                'avg_completion_rate': 0,
                'avg_time_accuracy': 0,
                'top_performers': [],
                'improvement_areas': [],
                'trends': []
            }

        # Calculate metrics
        total_estimated = 0
        total_actual = 0
        worker_stats = defaultdict(lambda: {'completed': 0, 'on_time': 0, 'total_rating': 0})

        for tracking, job in completed:
            total_estimated += job.estimated_hours or 0
            total_actual += float(tracking.actual_hours or 0)

            # Track by worker
            for assignment in job.assignments:
                worker_stats[assignment.user_id]['completed'] += 1
                if tracking.actual_hours and job.estimated_hours:
                    if float(tracking.actual_hours) <= float(job.estimated_hours) * 1.1:
                        worker_stats[assignment.user_id]['on_time'] += 1

        avg_time_accuracy = (total_estimated / total_actual * 100) if total_actual > 0 else 100

        # Get completion rate
        total_jobs = db.session.query(func.count(WorkPlanJob.id)).join(
            WorkPlanDay
        ).filter(
            WorkPlanDay.date >= period_start
        ).scalar() or 0

        avg_completion_rate = (len(completed) / total_jobs * 100) if total_jobs > 0 else 0

        # Find top performers
        top_performers = []
        for user_id, stats in worker_stats.items():
            if stats['completed'] >= 3:
                user = db.session.get(User, user_id)
                on_time_rate = stats['on_time'] / stats['completed'] if stats['completed'] > 0 else 0
                top_performers.append({
                    'user_id': user_id,
                    'user_name': user.full_name if user else 'Unknown',
                    'jobs_completed': stats['completed'],
                    'on_time_rate': round(on_time_rate * 100, 1)
                })

        top_performers.sort(key=lambda x: (x['on_time_rate'], x['jobs_completed']), reverse=True)

        # Find improvement areas
        improvement_areas = []
        estimation_issues = self.detect_time_estimation_issues()
        for issue in estimation_issues[:3]:
            improvement_areas.append(f"Time estimates for {issue['job_type'] or issue['equipment_type']} are off by {issue['error_rate']}%")

        if avg_completion_rate < 80:
            improvement_areas.append('Overall completion rate needs improvement')

        # Trends
        trends = []
        if avg_time_accuracy > 100:
            trends.append({'metric': 'time_accuracy', 'direction': 'improving', 'value': f'{avg_time_accuracy:.0f}%'})
        elif avg_time_accuracy < 90:
            trends.append({'metric': 'time_accuracy', 'direction': 'declining', 'value': f'{avg_time_accuracy:.0f}%'})

        return {
            'period': period,
            'period_start': period_start.isoformat(),
            'period_end': today.isoformat(),
            'avg_completion_rate': round(avg_completion_rate, 1),
            'avg_time_accuracy': round(avg_time_accuracy, 1),
            'total_jobs_completed': len(completed),
            'total_jobs_scheduled': total_jobs,
            'top_performers': top_performers[:10],
            'improvement_areas': improvement_areas,
            'trends': trends
        }

    def get_skill_gap_analysis(self) -> list:
        """
        Identify training needs based on job requirements vs worker skills.

        Returns:
            List of skill gaps with training priorities
        """
        skill_gaps = []

        # Analyze recent job assignments and performance
        ninety_days_ago = date.today() - timedelta(days=90)

        # Count jobs by specialization needed
        specialization_demand = defaultdict(int)
        specialization_supply = defaultdict(int)

        # Get job demand
        jobs = db.session.query(WorkPlanJob).join(
            WorkPlanDay
        ).join(
            Equipment
        ).filter(
            WorkPlanDay.date >= ninety_days_ago
        ).all()

        for job in jobs:
            if job.equipment and job.equipment.equipment_type:
                eq_type = job.equipment.equipment_type.lower()
                if 'electrical' in eq_type:
                    specialization_demand['electrical'] += 1
                elif 'mechanical' in eq_type:
                    specialization_demand['mechanical'] += 1
                elif 'hvac' in eq_type:
                    specialization_demand['hvac'] += 1

        # Get worker supply
        workers = User.query.filter(
            User.is_active == True,
            User.role.in_(['specialist', 'engineer'])
        ).all()

        for worker in workers:
            if worker.specialization:
                specialization_supply[worker.specialization] += 1

        # Calculate gaps
        for skill, demand in specialization_demand.items():
            supply = specialization_supply.get(skill, 0)
            jobs_per_worker = demand / supply if supply > 0 else float('inf')

            if jobs_per_worker > 30:  # More than 30 jobs per worker in 90 days
                priority = 'high' if jobs_per_worker > 50 else 'medium'
                skill_gaps.append({
                    'skill': skill,
                    'current_workers': supply,
                    'needed_workers': int(demand / 30) + 1,
                    'jobs_in_period': demand,
                    'jobs_per_worker': round(jobs_per_worker, 1),
                    'training_priority': priority,
                    'recommendation': f'Train {int(demand / 30) - supply + 1} more {skill} specialists' if supply > 0 else f'Hire or train {skill} specialists urgently'
                })

        # Check for job types with poor performance
        job_type_performance = db.session.query(
            WorkPlanJob.job_type,
            func.avg(WorkPlanJobRating.qc_rating).label('avg_rating'),
            func.count(WorkPlanJob.id).label('count')
        ).join(
            WorkPlanJobRating
        ).group_by(
            WorkPlanJob.job_type
        ).all()

        for job_type, avg_rating, count in job_type_performance:
            if avg_rating and float(avg_rating) < 3.5 and count > 10:
                skill_gaps.append({
                    'skill': f'{job_type}_quality',
                    'current_workers': 'N/A',
                    'needed_workers': 'N/A',
                    'avg_quality_rating': round(float(avg_rating), 2),
                    'training_priority': 'high' if avg_rating < 3.0 else 'medium',
                    'recommendation': f'Quality training needed for {job_type} jobs'
                })

        return sorted(skill_gaps, key=lambda x: {'high': 0, 'medium': 1, 'low': 2}.get(x['training_priority'], 3))

    def calculate_efficiency_score(self, plan_id: int = None, user_id: int = None) -> dict:
        """
        Rate planning or worker efficiency.

        Args:
            plan_id: Work plan ID (for plan efficiency)
            user_id: User ID (for worker efficiency)

        Returns:
            Efficiency score with breakdown
        """
        if plan_id:
            return self._calculate_plan_efficiency(plan_id)
        elif user_id:
            return self._calculate_worker_efficiency(user_id)
        else:
            return {'error': 'Either plan_id or user_id required'}

    def _calculate_plan_efficiency(self, plan_id: int) -> dict:
        """Calculate efficiency score for a plan."""
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        breakdown = {}
        total_score = 0

        # Factor 1: Completion rate (30 points)
        total_jobs = sum(len(day.jobs) for day in plan.days)
        completed_jobs = sum(
            1 for day in plan.days for job in day.jobs
            if job.tracking and job.tracking.status == 'completed'
        )
        completion_rate = (completed_jobs / total_jobs * 100) if total_jobs > 0 else 0
        completion_score = min(30, completion_rate * 0.3)
        breakdown['completion_rate'] = {'score': round(completion_score, 1), 'value': f'{completion_rate:.1f}%'}
        total_score += completion_score

        # Factor 2: Time accuracy (25 points)
        time_accuracy_list = []
        for day in plan.days:
            for job in day.jobs:
                if job.tracking and job.tracking.actual_hours and job.estimated_hours:
                    accuracy = float(job.estimated_hours) / float(job.tracking.actual_hours)
                    time_accuracy_list.append(accuracy)

        if time_accuracy_list:
            avg_accuracy = statistics.mean(time_accuracy_list)
            time_score = min(25, max(0, 25 - abs(1 - avg_accuracy) * 25))
        else:
            time_score = 12.5  # Default if no data
            avg_accuracy = None

        breakdown['time_accuracy'] = {'score': round(time_score, 1), 'value': f'{avg_accuracy * 100:.1f}%' if avg_accuracy else 'N/A'}
        total_score += time_score

        # Factor 3: Workload balance (20 points)
        worker_hours = defaultdict(float)
        for day in plan.days:
            for job in day.jobs:
                for assignment in job.assignments:
                    worker_hours[assignment.user_id] += job.estimated_hours or 0

        if len(worker_hours) > 1:
            hours_list = list(worker_hours.values())
            std_dev = statistics.stdev(hours_list)
            mean_hours = statistics.mean(hours_list)
            cv = std_dev / mean_hours if mean_hours > 0 else 0
            balance_score = max(0, 20 - cv * 20)
        else:
            balance_score = 10  # Default

        breakdown['workload_balance'] = {'score': round(balance_score, 1), 'value': f'CV: {cv:.2f}' if len(worker_hours) > 1 else 'N/A'}
        total_score += balance_score

        # Factor 4: Assignment coverage (15 points)
        assigned_jobs = sum(1 for day in plan.days for job in day.jobs if job.assignments)
        assignment_rate = (assigned_jobs / total_jobs * 100) if total_jobs > 0 else 0
        assignment_score = min(15, assignment_rate * 0.15)
        breakdown['assignment_coverage'] = {'score': round(assignment_score, 1), 'value': f'{assignment_rate:.1f}%'}
        total_score += assignment_score

        # Factor 5: On-time rate (10 points)
        on_time_jobs = 0
        for day in plan.days:
            for job in day.jobs:
                if job.tracking and job.tracking.status == 'completed':
                    if job.tracking.actual_hours and job.estimated_hours:
                        if float(job.tracking.actual_hours) <= float(job.estimated_hours) * 1.1:
                            on_time_jobs += 1

        on_time_rate = (on_time_jobs / completed_jobs * 100) if completed_jobs > 0 else 0
        on_time_score = min(10, on_time_rate * 0.1)
        breakdown['on_time_rate'] = {'score': round(on_time_score, 1), 'value': f'{on_time_rate:.1f}%'}
        total_score += on_time_score

        # Compare to average
        avg_score = 65  # Assumed average
        comparison = total_score - avg_score

        return {
            'entity_type': 'plan',
            'entity_id': plan_id,
            'score': round(total_score, 1),
            'max_score': 100,
            'breakdown': breakdown,
            'comparison_to_avg': round(comparison, 1),
            'suggestions': self._get_efficiency_suggestions(breakdown)
        }

    def _calculate_worker_efficiency(self, user_id: int) -> dict:
        """Calculate efficiency score for a worker."""
        user = db.session.get(User, user_id)
        if not user:
            return {'error': 'User not found'}

        breakdown = {}
        total_score = 0

        # Get recent work data
        thirty_days_ago = date.today() - timedelta(days=30)

        completed_jobs = db.session.query(WorkPlanJobTracking, WorkPlanJob).join(
            WorkPlanJob
        ).join(
            WorkPlanAssignment
        ).join(
            WorkPlanDay
        ).filter(
            WorkPlanAssignment.user_id == user_id,
            WorkPlanJobTracking.status == 'completed',
            WorkPlanDay.date >= thirty_days_ago
        ).all()

        total_assigned = db.session.query(WorkPlanAssignment).join(
            WorkPlanJob
        ).join(
            WorkPlanDay
        ).filter(
            WorkPlanAssignment.user_id == user_id,
            WorkPlanDay.date >= thirty_days_ago
        ).count()

        # Factor 1: Completion rate (30 points)
        completion_rate = (len(completed_jobs) / total_assigned * 100) if total_assigned > 0 else 0
        completion_score = min(30, completion_rate * 0.3)
        breakdown['completion_rate'] = {'score': round(completion_score, 1), 'value': f'{completion_rate:.1f}%'}
        total_score += completion_score

        # Factor 2: Time efficiency (30 points)
        time_ratios = []
        for tracking, job in completed_jobs:
            if tracking.actual_hours and job.estimated_hours:
                ratio = float(job.estimated_hours) / float(tracking.actual_hours)
                time_ratios.append(ratio)

        if time_ratios:
            avg_efficiency = statistics.mean(time_ratios)
            time_score = min(30, avg_efficiency * 25)
        else:
            avg_efficiency = None
            time_score = 15

        breakdown['time_efficiency'] = {'score': round(time_score, 1), 'value': f'{avg_efficiency * 100:.1f}%' if avg_efficiency else 'N/A'}
        total_score += time_score

        # Factor 3: Quality ratings (25 points)
        ratings = db.session.query(
            func.avg(WorkPlanJobRating.qc_rating)
        ).filter(
            WorkPlanJobRating.user_id == user_id
        ).scalar()

        if ratings:
            avg_rating = float(ratings)
            quality_score = min(25, avg_rating * 5)
        else:
            avg_rating = None
            quality_score = 12.5

        breakdown['quality_rating'] = {'score': round(quality_score, 1), 'value': f'{avg_rating:.1f}/5' if avg_rating else 'N/A'}
        total_score += quality_score

        # Factor 4: Consistency (15 points)
        if time_ratios and len(time_ratios) > 1:
            std_dev = statistics.stdev(time_ratios)
            consistency_score = max(0, 15 - std_dev * 10)
        else:
            consistency_score = 7.5
            std_dev = None

        breakdown['consistency'] = {'score': round(consistency_score, 1), 'value': f'StdDev: {std_dev:.2f}' if std_dev else 'N/A'}
        total_score += consistency_score

        # Compare to average
        avg_worker_score = 60
        comparison = total_score - avg_worker_score

        return {
            'entity_type': 'worker',
            'entity_id': user_id,
            'entity_name': user.full_name,
            'score': round(total_score, 1),
            'max_score': 100,
            'breakdown': breakdown,
            'comparison_to_avg': round(comparison, 1),
            'suggestions': self._get_worker_suggestions(breakdown, user)
        }

    def _get_efficiency_suggestions(self, breakdown: dict) -> list:
        """Generate efficiency improvement suggestions."""
        suggestions = []

        if breakdown.get('completion_rate', {}).get('score', 0) < 20:
            suggestions.append('Focus on completing more assigned jobs')

        if breakdown.get('workload_balance', {}).get('score', 0) < 12:
            suggestions.append('Distribute workload more evenly across workers')

        if breakdown.get('assignment_coverage', {}).get('score', 0) < 10:
            suggestions.append('Ensure all jobs have workers assigned')

        if breakdown.get('on_time_rate', {}).get('score', 0) < 6:
            suggestions.append('Review time estimates for accuracy')

        return suggestions

    def _get_worker_suggestions(self, breakdown: dict, user: User) -> list:
        """Generate worker improvement suggestions."""
        suggestions = []

        if breakdown.get('time_efficiency', {}).get('score', 0) < 20:
            suggestions.append('Work on improving task completion speed')

        if breakdown.get('quality_rating', {}).get('score', 0) < 15:
            suggestions.append('Focus on quality of work to improve ratings')

        if breakdown.get('consistency', {}).get('score', 0) < 8:
            suggestions.append('Work on maintaining consistent performance')

        return suggestions

    # ========================================
    # NATURAL LANGUAGE
    # ========================================

    def process_planning_query(self, query: str) -> dict:
        """
        Process natural language planning commands.

        Args:
            query: Natural language query like:
                - "Schedule pump maintenance for Monday"
                - "Who's available tomorrow afternoon?"
                - "Move job 123 to next week"

        Returns:
            {
                intent: detected intent,
                entities: extracted entities,
                action: suggested action,
                confirmation_needed: bool,
                response: natural language response
            }
        """
        query_lower = query.lower().strip()

        intent = 'unknown'
        entities = {}
        action = None
        confirmation_needed = False
        response = ''

        # Intent: Schedule job
        if any(word in query_lower for word in ['schedule', 'plan', 'add job', 'create job']):
            intent = 'schedule_job'

            # Extract day
            days_of_week = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            for day in days_of_week:
                if day in query_lower:
                    entities['target_day'] = day.capitalize()
                    break

            if 'tomorrow' in query_lower:
                entities['target_day'] = (date.today() + timedelta(days=1)).strftime('%A')

            # Extract equipment type
            equipment_types = ['pump', 'crane', 'motor', 'conveyor', 'hvac', 'electrical']
            for eq_type in equipment_types:
                if eq_type in query_lower:
                    entities['equipment_type'] = eq_type
                    break

            # Extract job type
            if 'maintenance' in query_lower or 'pm' in query_lower:
                entities['job_type'] = 'pm'
            elif 'repair' in query_lower or 'fix' in query_lower:
                entities['job_type'] = 'defect'
            elif 'inspection' in query_lower or 'inspect' in query_lower:
                entities['job_type'] = 'inspection'

            action = {
                'type': 'create_job',
                'params': entities
            }
            confirmation_needed = True
            response = f"I'll schedule a {entities.get('job_type', 'maintenance')} job for {entities.get('equipment_type', 'equipment')} on {entities.get('target_day', 'the selected day')}. Please confirm."

        # Intent: Check availability
        elif any(word in query_lower for word in ['available', 'who can', 'free', 'capacity']):
            intent = 'check_availability'

            # Extract time
            if 'tomorrow' in query_lower:
                entities['date'] = (date.today() + timedelta(days=1)).isoformat()
            elif 'today' in query_lower:
                entities['date'] = date.today().isoformat()

            if 'morning' in query_lower:
                entities['time_slot'] = 'morning'
            elif 'afternoon' in query_lower:
                entities['time_slot'] = 'afternoon'

            # Get available workers
            target_date = date.fromisoformat(entities.get('date', date.today().isoformat()))
            available = User.query.filter(
                User.is_active == True,
                User.is_on_leave == False,
                User.role.in_(['specialist', 'engineer'])
            ).all()

            entities['available_workers'] = [
                {'id': u.id, 'name': u.full_name, 'specialization': u.specialization}
                for u in available
            ]

            action = {
                'type': 'show_availability',
                'params': entities
            }
            response = f"Found {len(available)} workers available. Top options: {', '.join(u.full_name for u in available[:3])}"

        # Intent: Move job
        elif any(word in query_lower for word in ['move', 'reschedule', 'postpone', 'delay']):
            intent = 'move_job'

            # Extract job ID
            import re
            job_match = re.search(r'job\s*#?(\d+)', query_lower)
            if job_match:
                entities['job_id'] = int(job_match.group(1))

            # Extract target
            if 'next week' in query_lower:
                entities['target'] = 'next_week'
            elif 'tomorrow' in query_lower:
                entities['target'] = (date.today() + timedelta(days=1)).isoformat()

            days_of_week = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            for day in days_of_week:
                if day in query_lower:
                    entities['target_day'] = day.capitalize()
                    break

            action = {
                'type': 'move_job',
                'params': entities
            }
            confirmation_needed = True
            response = f"I'll move job #{entities.get('job_id', 'N/A')} to {entities.get('target', entities.get('target_day', 'new date'))}. Please confirm."

        # Intent: Get status
        elif any(word in query_lower for word in ['status', 'progress', 'how is', 'update']):
            intent = 'get_status'

            if 'plan' in query_lower or 'week' in query_lower:
                entities['scope'] = 'plan'
            elif 'job' in query_lower:
                import re
                job_match = re.search(r'job\s*#?(\d+)', query_lower)
                if job_match:
                    entities['job_id'] = int(job_match.group(1))
                entities['scope'] = 'job'
            else:
                entities['scope'] = 'plan'

            action = {
                'type': 'get_status',
                'params': entities
            }
            response = "Fetching current status..."

        # Intent: Assign worker
        elif any(word in query_lower for word in ['assign', 'allocate', 'give job to']):
            intent = 'assign_worker'

            import re
            job_match = re.search(r'job\s*#?(\d+)', query_lower)
            if job_match:
                entities['job_id'] = int(job_match.group(1))

            # Try to extract worker name
            # This would be enhanced with actual worker name matching
            action = {
                'type': 'assign_worker',
                'params': entities
            }
            confirmation_needed = True
            response = "Please specify the worker to assign."

        else:
            response = "I'm not sure what you'd like to do. Try commands like 'Schedule pump maintenance for Monday' or 'Who's available tomorrow?'"

        return {
            'original_query': query,
            'intent': intent,
            'entities': entities,
            'action': action,
            'confirmation_needed': confirmation_needed,
            'response': response
        }

    def generate_plan_summary(self, plan_id: int) -> str:
        """
        Generate human-readable plan summary.

        Args:
            plan_id: Work plan ID

        Returns:
            Natural language description of the plan
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return "Plan not found."

        # Gather stats
        total_jobs = sum(len(day.jobs) for day in plan.days)
        total_hours = sum(
            sum(job.estimated_hours or 0 for job in day.jobs)
            for day in plan.days
        )

        # Count by type
        pm_count = sum(1 for day in plan.days for job in day.jobs if job.job_type == 'pm')
        defect_count = sum(1 for day in plan.days for job in day.jobs if job.job_type == 'defect')
        inspection_count = sum(1 for day in plan.days for job in day.jobs if job.job_type == 'inspection')

        # Count by priority
        urgent_count = sum(1 for day in plan.days for job in day.jobs if job.computed_priority in ('critical', 'high'))

        # Get worker count
        worker_ids = set()
        for day in plan.days:
            for job in day.jobs:
                for assignment in job.assignments:
                    worker_ids.add(assignment.user_id)

        # Build summary
        parts = []

        parts.append(f"Work Plan for {plan.week_start.strftime('%B %d')} - {plan.week_end.strftime('%B %d, %Y')}:")
        parts.append(f"\nThis week includes {total_jobs} jobs totaling {total_hours:.0f} estimated hours.")

        if pm_count > 0:
            parts.append(f"- {pm_count} preventive maintenance jobs")
        if defect_count > 0:
            parts.append(f"- {defect_count} defect repair jobs")
        if inspection_count > 0:
            parts.append(f"- {inspection_count} inspection jobs")

        if urgent_count > 0:
            parts.append(f"\n{urgent_count} jobs require urgent attention due to overdue status or high priority.")

        parts.append(f"\n{len(worker_ids)} workers are assigned to this plan.")

        # Daily breakdown
        parts.append("\nDaily breakdown:")
        for day in plan.days:
            day_jobs = len(day.jobs)
            day_hours = sum(job.estimated_hours or 0 for job in day.jobs)
            parts.append(f"- {day.date.strftime('%A')}: {day_jobs} jobs, {day_hours:.0f}h")

        # Status
        if plan.status == 'published':
            parts.append(f"\nThis plan was published on {plan.published_at.strftime('%B %d') if plan.published_at else 'N/A'}.")
        else:
            parts.append("\nThis plan is still in draft status.")

        return '\n'.join(parts)

    # ========================================
    # WHAT-IF SCENARIOS
    # ========================================

    def simulate_scenario(self, plan_id: int, scenario: dict) -> dict:
        """
        Simulate schedule changes.

        Args:
            plan_id: Work plan ID
            scenario: {
                type: 'remove_worker'|'add_job'|'delay',
                params: {...}
            }

        Returns:
            {
                impact: impact analysis,
                feasibility: bool,
                recommendations: list
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        scenario_type = scenario.get('type')
        params = scenario.get('params', {})

        impact = {}
        feasibility = True
        recommendations = []

        if scenario_type == 'remove_worker':
            user_id = params.get('user_id')
            if not user_id:
                return {'error': 'user_id required for remove_worker scenario'}

            # Find all jobs assigned to this worker
            affected_jobs = []
            affected_hours = 0

            for day in plan.days:
                for job in day.jobs:
                    for assignment in job.assignments:
                        if assignment.user_id == user_id:
                            affected_jobs.append({
                                'job_id': job.id,
                                'day': day.date.isoformat(),
                                'hours': job.estimated_hours
                            })
                            affected_hours += job.estimated_hours or 0

            impact = {
                'jobs_affected': len(affected_jobs),
                'hours_to_reassign': affected_hours,
                'affected_jobs': affected_jobs
            }

            # Check if other workers can absorb
            other_workers_capacity = 0
            for day in plan.days:
                day_assignments = defaultdict(float)
                for job in day.jobs:
                    for assignment in job.assignments:
                        if assignment.user_id != user_id:
                            day_assignments[assignment.user_id] += job.estimated_hours or 0

                for uid, hours in day_assignments.items():
                    other_workers_capacity += max(0, 8 - hours)

            if other_workers_capacity < affected_hours:
                feasibility = False
                recommendations.append('Not enough capacity among other workers')
                recommendations.append(f'Need to add {affected_hours - other_workers_capacity:.1f}h of worker capacity')
            else:
                recommendations.append('Jobs can be redistributed to other workers')

        elif scenario_type == 'add_job':
            new_job_hours = params.get('hours', 2)
            target_day = params.get('target_day')
            job_type = params.get('job_type', 'pm')

            # Find available capacity
            day_capacities = {}
            for day in plan.days:
                total_hours = sum(job.estimated_hours or 0 for job in day.jobs)
                worker_count = len(set(
                    a.user_id for job in day.jobs for a in job.assignments
                ))
                capacity = max(0, worker_count * 8 - total_hours)
                day_capacities[day.date.isoformat()] = capacity

            impact = {
                'new_job_hours': new_job_hours,
                'day_capacities': day_capacities
            }

            best_day = max(day_capacities, key=day_capacities.get) if day_capacities else None
            if best_day and day_capacities.get(best_day, 0) >= new_job_hours:
                feasibility = True
                recommendations.append(f'Best day to add job: {best_day} ({day_capacities[best_day]:.1f}h available)')
            else:
                feasibility = False
                recommendations.append('No day has enough capacity for this job')
                recommendations.append('Consider adding workers or extending hours')

        elif scenario_type == 'delay':
            job_id = params.get('job_id')
            delay_hours = params.get('delay_hours', 2)

            if not job_id:
                return {'error': 'job_id required for delay scenario'}

            job = db.session.get(WorkPlanJob, job_id)
            if not job:
                return {'error': 'Job not found'}

            # Find subsequent jobs that may be affected
            day = job.day
            subsequent_jobs = [j for j in day.jobs if j.position > job.position] if day else []

            impact = {
                'delayed_job_id': job_id,
                'delay_hours': delay_hours,
                'subsequent_jobs_affected': len(subsequent_jobs),
                'total_cascade_hours': sum(j.estimated_hours or 0 for j in subsequent_jobs)
            }

            if len(subsequent_jobs) > 0:
                recommendations.append(f'{len(subsequent_jobs)} subsequent jobs will be delayed')

            if subsequent_jobs and any(j.priority == 'urgent' for j in subsequent_jobs):
                feasibility = False
                recommendations.append('Delay would affect urgent jobs - consider reassignment')
            else:
                feasibility = True
                recommendations.append('Delay is manageable within current schedule')

        return {
            'scenario_type': scenario_type,
            'params': params,
            'impact': impact,
            'feasibility': feasibility,
            'recommendations': recommendations
        }

    def compare_schedules(self, plan_id_a: int, plan_id_b: int) -> dict:
        """
        Compare two plan versions.

        Args:
            plan_id_a: First plan ID
            plan_id_b: Second plan ID

        Returns:
            {
                differences: list of differences,
                efficiency_comparison: comparison metrics,
                recommendation: which is better
            }
        """
        plan_a = db.session.get(WorkPlan, plan_id_a)
        plan_b = db.session.get(WorkPlan, plan_id_b)

        if not plan_a or not plan_b:
            return {'error': 'One or both plans not found'}

        differences = []

        # Compare job counts
        jobs_a = sum(len(day.jobs) for day in plan_a.days)
        jobs_b = sum(len(day.jobs) for day in plan_b.days)

        if jobs_a != jobs_b:
            differences.append({
                'type': 'job_count',
                'plan_a': jobs_a,
                'plan_b': jobs_b,
                'description': f'Plan A has {jobs_a} jobs, Plan B has {jobs_b} jobs'
            })

        # Compare total hours
        hours_a = sum(sum(job.estimated_hours or 0 for job in day.jobs) for day in plan_a.days)
        hours_b = sum(sum(job.estimated_hours or 0 for job in day.jobs) for day in plan_b.days)

        if abs(hours_a - hours_b) > 1:
            differences.append({
                'type': 'total_hours',
                'plan_a': hours_a,
                'plan_b': hours_b,
                'description': f'Plan A: {hours_a:.1f}h, Plan B: {hours_b:.1f}h'
            })

        # Compare worker assignments
        workers_a = len(set(
            a.user_id for day in plan_a.days for job in day.jobs for a in job.assignments
        ))
        workers_b = len(set(
            a.user_id for day in plan_b.days for job in day.jobs for a in job.assignments
        ))

        if workers_a != workers_b:
            differences.append({
                'type': 'worker_count',
                'plan_a': workers_a,
                'plan_b': workers_b,
                'description': f'Plan A uses {workers_a} workers, Plan B uses {workers_b} workers'
            })

        # Calculate efficiency scores
        efficiency_a = self.calculate_efficiency_score(plan_id=plan_id_a)
        efficiency_b = self.calculate_efficiency_score(plan_id=plan_id_b)

        efficiency_comparison = {
            'plan_a_score': efficiency_a.get('score', 0),
            'plan_b_score': efficiency_b.get('score', 0),
            'plan_a_breakdown': efficiency_a.get('breakdown', {}),
            'plan_b_breakdown': efficiency_b.get('breakdown', {})
        }

        # Recommendation
        score_a = efficiency_a.get('score', 0)
        score_b = efficiency_b.get('score', 0)

        if score_a > score_b + 5:
            recommendation = f'Plan A is recommended (score: {score_a:.1f} vs {score_b:.1f})'
        elif score_b > score_a + 5:
            recommendation = f'Plan B is recommended (score: {score_b:.1f} vs {score_a:.1f})'
        else:
            recommendation = 'Both plans are similar in efficiency. Choose based on specific requirements.'

        return {
            'plan_a_id': plan_id_a,
            'plan_b_id': plan_id_b,
            'differences': differences,
            'efficiency_comparison': efficiency_comparison,
            'recommendation': recommendation
        }

    # ========================================
    # COMPLIANCE
    # ========================================

    def check_safety_compliance(self, plan_id: int) -> dict:
        """
        Verify all safety requirements are met.

        Args:
            plan_id: Work plan ID

        Returns:
            {
                compliant: bool,
                violations: list,
                warnings: list
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        violations = []
        warnings = []

        # Check 1: Maximum hours per worker per day
        for day in plan.days:
            worker_hours = defaultdict(float)
            for job in day.jobs:
                for assignment in job.assignments:
                    worker_hours[assignment.user_id] += job.estimated_hours or 0

            for user_id, hours in worker_hours.items():
                if hours > 12:
                    user = db.session.get(User, user_id)
                    violations.append({
                        'type': 'excessive_hours',
                        'description': f'{user.full_name if user else "Worker"} scheduled for {hours:.1f}h on {day.date}',
                        'limit': '12 hours per day'
                    })
                elif hours > 10:
                    user = db.session.get(User, user_id)
                    warnings.append({
                        'type': 'high_hours',
                        'description': f'{user.full_name if user else "Worker"} scheduled for {hours:.1f}h on {day.date}',
                        'recommendation': 'Consider redistributing workload'
                    })

        # Check 2: Minimum rest between shifts
        worker_last_job = {}
        for day in sorted(plan.days, key=lambda d: d.date):
            for job in day.jobs:
                for assignment in job.assignments:
                    if assignment.user_id in worker_last_job:
                        last_date = worker_last_job[assignment.user_id]
                        if day.date == last_date:
                            continue  # Same day, OK
                        # Check gap
                        gap = (day.date - last_date).days
                        if gap == 0:  # Consecutive days with long hours
                            # Check if both days have >10 hours
                            pass  # Would need more detailed tracking

                    worker_last_job[assignment.user_id] = day.date

        # Check 3: Specialized equipment requires certified workers
        for day in plan.days:
            for job in day.jobs:
                if job.equipment and job.equipment.equipment_type:
                    eq_type = job.equipment.equipment_type.lower()

                    # Electrical work needs electrical specialist
                    if 'electrical' in eq_type or 'high voltage' in eq_type:
                        has_specialist = any(
                            db.session.get(User, a.user_id).specialization == 'electrical'
                            for a in job.assignments
                            if db.session.get(User, a.user_id)
                        )
                        if not has_specialist and job.assignments:
                            warnings.append({
                                'type': 'specialization_mismatch',
                                'description': f'Electrical job {job.id} has no electrical specialist assigned',
                                'recommendation': 'Assign worker with electrical specialization'
                            })

        # Check 4: Critical equipment needs team
        for day in plan.days:
            for job in day.jobs:
                if job.equipment and job.equipment.criticality_level == 'critical':
                    if len(job.assignments) < 2:
                        warnings.append({
                            'type': 'critical_equipment_team',
                            'description': f'Critical equipment job {job.id} has only {len(job.assignments)} worker(s)',
                            'recommendation': 'Assign at least 2 workers for critical equipment'
                        })

        compliant = len(violations) == 0

        return {
            'plan_id': plan_id,
            'compliant': compliant,
            'violations': violations,
            'warnings': warnings,
            'checked_at': datetime.utcnow().isoformat()
        }

    def check_sla_compliance(self, plan_id: int) -> dict:
        """
        Check SLA deadline compliance.

        Args:
            plan_id: Work plan ID

        Returns:
            {
                compliant: bool,
                at_risk: list of jobs at risk of SLA breach,
                breached: list of already breached SLAs
            }
        """
        plan = db.session.get(WorkPlan, plan_id)
        if not plan:
            return {'error': 'Work plan not found'}

        at_risk = []
        breached = []

        for day in plan.days:
            for job in day.jobs:
                # Check if job has SLA (based on overdue status)
                if job.overdue_value and job.overdue_value > 0:
                    if job.computed_priority == 'critical':
                        breached.append({
                            'job_id': job.id,
                            'equipment': job.equipment.name if job.equipment else 'N/A',
                            'overdue_by': f'{job.overdue_value} {job.overdue_unit}',
                            'scheduled_date': day.date.isoformat()
                        })
                    else:
                        at_risk.append({
                            'job_id': job.id,
                            'equipment': job.equipment.name if job.equipment else 'N/A',
                            'overdue_by': f'{job.overdue_value} {job.overdue_unit}',
                            'scheduled_date': day.date.isoformat()
                        })

                # Check defect SLAs
                if job.job_type == 'defect' and job.defect:
                    defect = job.defect
                    if defect.severity == 'critical':
                        # Critical defects should be resolved within 24 hours
                        if defect.created_at and (datetime.utcnow() - defect.created_at).total_seconds() > 24 * 3600:
                            breached.append({
                                'job_id': job.id,
                                'type': 'defect_sla',
                                'defect_id': defect.id,
                                'severity': defect.severity,
                                'age_hours': int((datetime.utcnow() - defect.created_at).total_seconds() / 3600),
                                'scheduled_date': day.date.isoformat()
                            })
                    elif defect.severity == 'high':
                        # High severity should be resolved within 72 hours
                        if defect.created_at and (datetime.utcnow() - defect.created_at).total_seconds() > 72 * 3600:
                            at_risk.append({
                                'job_id': job.id,
                                'type': 'defect_sla',
                                'defect_id': defect.id,
                                'severity': defect.severity,
                                'age_hours': int((datetime.utcnow() - defect.created_at).total_seconds() / 3600),
                                'scheduled_date': day.date.isoformat()
                            })

        compliant = len(breached) == 0

        return {
            'plan_id': plan_id,
            'compliant': compliant,
            'at_risk': at_risk,
            'at_risk_count': len(at_risk),
            'breached': breached,
            'breached_count': len(breached),
            'checked_at': datetime.utcnow().isoformat()
        }

    # ========================================
    # VOICE & IMAGE
    # ========================================

    def transcribe_handover(self, audio_file_id: int) -> dict:
        """
        Transcribe voice handover notes.

        Args:
            audio_file_id: ID of the audio file

        Returns:
            {
                transcription: full text,
                key_points: list of key points,
                action_items: list of actions extracted
            }
        """
        from app.models.file import File

        file = db.session.get(File, audio_file_id)
        if not file:
            return {'error': 'File not found'}

        # Note: This would integrate with OpenAI Whisper or similar
        # For now, return placeholder if transcription exists
        if hasattr(file, 'transcription') and file.transcription:
            transcription = file.transcription
        else:
            # Would call OpenAI Whisper here
            return {
                'transcription': None,
                'key_points': [],
                'action_items': [],
                'message': 'Audio transcription service not configured'
            }

        # Extract key points and action items using AI
        # This would call OpenAI
        key_points = []
        action_items = []

        # Simple extraction based on keywords
        sentences = transcription.split('.')
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            if any(word in sentence.lower() for word in ['need', 'must', 'should', 'required', 'important']):
                key_points.append(sentence)

            if any(word in sentence.lower() for word in ['please', 'make sure', 'check', 'verify', 'complete', 'finish']):
                action_items.append(sentence)

        return {
            'transcription': transcription,
            'key_points': key_points[:5],
            'action_items': action_items[:5]
        }

    def analyze_completion_photo(self, photo_file_id: int, job_type: str) -> dict:
        """
        Analyze job completion photo.

        Args:
            photo_file_id: ID of the photo file
            job_type: Type of job (pm, defect, inspection)

        Returns:
            {
                appears_complete: bool,
                observations: list,
                concerns: list
            }
        """
        from app.models.file import File

        file = db.session.get(File, photo_file_id)
        if not file:
            return {'error': 'File not found'}

        # Get image URL
        image_url = file.get_url() if hasattr(file, 'get_url') else file.file_path

        if not image_url:
            return {'error': 'Image URL not available'}

        # Call vision service
        try:
            analysis = self.vision_service.analyze_defect_photo(image_url)
        except Exception as e:
            logger.error(f"Vision analysis failed: {e}")
            return {
                'appears_complete': None,
                'observations': [],
                'concerns': ['Vision analysis service not available'],
                'error': str(e)
            }

        if analysis.get('error'):
            return {
                'appears_complete': None,
                'observations': [],
                'concerns': [analysis['error']]
            }

        # Interpret results based on job type
        observations = []
        concerns = []
        appears_complete = True

        description = analysis.get('description', '')
        severity = analysis.get('severity', 'N/A')
        safety_risk = analysis.get('safety_risk', '')

        observations.append(description)

        if severity not in ('N/A', 'LOW'):
            concerns.append(f'Detected issue with severity: {severity}')
            if job_type == 'defect':
                appears_complete = False

        if safety_risk and safety_risk.lower() not in ('none', 'n/a', 'none identified'):
            concerns.append(f'Safety concern: {safety_risk}')
            appears_complete = False

        if analysis.get('recommendation'):
            observations.append(f"Recommendation: {analysis['recommendation']}")

        return {
            'appears_complete': appears_complete,
            'observations': observations,
            'concerns': concerns,
            'raw_analysis': analysis
        }
