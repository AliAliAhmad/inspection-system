import type { Notification } from '../types/notification.types';

/**
 * Derive the frontend route for a notification based on its type, related data, and the user's role.
 * Returns null if no meaningful route can be determined.
 */
export function getNotificationRoute(
  notification: Notification,
  userRole: string,
): string | null {
  const { type, related_id } = notification;

  switch (type) {
    // Inspection
    case 'inspection_submitted':
      return '/admin/inspections';
    case 'inspection_assigned':
    case 'backlog_triggered':
      return '/inspector/assignments';
    case 'inspection_rated':
      return '/profile';

    // Leaves
    case 'leave_requested':
    case 'leave_coverage_assigned':
      return userRole === 'admin' ? '/admin/approvals?tab=leaves' : '/leaves';
    case 'leave_notification':
    case 'leave_rejected':
    case 'leave_balance_updated':
    case 'coverage_assigned':
      return '/leaves';

    // Engineer jobs
    case 'engineer_job_created':
      return related_id ? `/engineer/jobs/${related_id}` : '/engineer/jobs';

    // Specialist jobs
    case 'specialist_job_assigned':
    case 'stalled_job_available':
      if (userRole === 'specialist' && related_id) return `/specialist/jobs/${related_id}`;
      return '/admin/specialist-jobs';

    // Defects
    case 'defect_created':
    case 'defect_resolved':
    case 'defect_rejected':
      if (userRole === 'admin') return '/admin/defects';
      return '/specialist/jobs';

    // Quality reviews
    case 'quality_review_assigned':
    case 'sla_warning':
      return related_id ? `/quality/reviews/${related_id}` : '/quality/reviews';
    case 'quality_approved':
    case 'rejection_validated':
      if (userRole === 'specialist') return '/specialist/jobs';
      if (userRole === 'engineer') return '/engineer/jobs';
      return '/admin/quality-reviews';
    case 'quality_rejection_pending':
      return '/admin/quality-reviews';

    // Pause
    case 'pause_requested':
      return userRole === 'admin' ? '/admin/approvals?tab=pauses' : '/engineer/pause-approvals';
    case 'pause_approved':
    case 'pause_denied':
      if (userRole === 'specialist') return '/specialist/jobs';
      if (userRole === 'engineer') return '/engineer/jobs';
      return null;

    // Bonus
    case 'bonus_awarded':
    case 'bonus_denied':
      return '/leaderboard';
    case 'bonus_request':
      return userRole === 'admin' ? '/admin/approvals?tab=bonus' : '/quality/bonus-requests';

    // Assessment
    case 'assessment_required':
      return related_id ? `/inspector/assessment/${related_id}` : '/inspector/assignments';
    case 'equipment_stopped':
      return '/admin/equipment';

    // Takeover
    case 'takeover_requested':
      return '/admin/specialist-jobs';
    case 'takeover_approved':
    case 'takeover_denied':
    case 'takeover_bonus':
      return '/specialist/jobs';

    // Admin alerts
    case 'wrong_finding':
    case 'job_incomplete':
      return '/admin/specialist-jobs';

    default:
      return null;
  }
}

/**
 * Map notification type to a React Navigation screen name for mobile.
 * Returns { screen, params } or null.
 */
export function getNotificationMobileRoute(
  notification: Notification,
  userRole: string,
): { screen: string; params?: Record<string, any> } | null {
  const { type, related_id } = notification;

  switch (type) {
    // Inspection
    case 'inspection_assigned':
    case 'backlog_triggered':
      if (related_id) return { screen: 'InspectionChecklist', params: { id: related_id } };
      return { screen: 'Assignments' };

    case 'inspection_submitted':
      if (related_id) return { screen: 'InspectionDetail', params: { id: related_id } };
      return { screen: 'AllInspections' };

    case 'inspection_rated':
      return { screen: 'Profile' };

    // Specialist jobs
    case 'specialist_job_assigned':
    case 'stalled_job_available':
      if (related_id) return { screen: 'SpecialistJobDetail', params: { id: related_id } };
      return { screen: 'AllSpecialistJobs' };

    // Engineer jobs
    case 'engineer_job_created':
      if (related_id) return { screen: 'EngineerJobDetail', params: { id: related_id } };
      return { screen: 'AllEngineerJobs' };

    // Quality reviews
    case 'quality_review_assigned':
    case 'sla_warning':
      if (related_id) return { screen: 'ReviewDetail', params: { id: related_id } };
      return null;

    case 'quality_approved':
    case 'rejection_validated':
    case 'quality_rejection_pending':
      return { screen: 'QualityReviewsAdmin' };

    // Defects
    case 'defect_created':
    case 'defect_resolved':
    case 'defect_rejected':
      return { screen: 'Defects' };

    // Assessment
    case 'assessment_required':
      if (related_id) return { screen: 'Assessment', params: { id: related_id } };
      return { screen: 'Assignments' };

    case 'assessment_submitted':
      if (related_id) return { screen: 'Assessment', params: { id: related_id } };
      return { screen: 'AssessmentTracking' };

    case 'equipment_stopped':
      return { screen: 'Equipment' };

    // Leaves
    case 'leave_requested':
    case 'leave_coverage_assigned':
      if (userRole === 'admin' || userRole === 'engineer') return { screen: 'LeaveApprovals' };
      return { screen: 'Profile' };

    case 'leave_notification':
    case 'leave_rejected':
    case 'leave_balance_updated':
    case 'coverage_assigned':
      return { screen: 'Profile' };

    // Pause
    case 'pause_requested':
    case 'pause_approved':
    case 'pause_denied':
      if (userRole === 'specialist' && related_id) return { screen: 'SpecialistJobDetail', params: { id: related_id } };
      if (userRole === 'engineer' && related_id) return { screen: 'EngineerJobDetail', params: { id: related_id } };
      return null;

    // Bonus
    case 'bonus_awarded':
    case 'bonus_denied':
    case 'bonus_request':
      if (userRole === 'admin') return { screen: 'BonusApprovals' };
      return { screen: 'Profile' };

    // Takeover
    case 'takeover_requested':
      return { screen: 'AllSpecialistJobs' };

    case 'takeover_approved':
    case 'takeover_denied':
    case 'takeover_bonus':
      if (related_id) return { screen: 'SpecialistJobDetail', params: { id: related_id } };
      return null;

    // Admin alerts
    case 'wrong_finding':
    case 'job_incomplete':
      return { screen: 'AllSpecialistJobs' };

    // Mention
    case 'mention':
      return { screen: 'Notifications' };

    default:
      return null;
  }
}
