/**
 * Points and gamification types.
 * Centralized point calculation types.
 */

export type PointAction =
  | 'inspection_complete'
  | 'inspection_quality_bonus'
  | 'defect_found'
  | 'critical_defect_found'
  | 'defect_resolved'
  | 'defect_resolved_early'
  | 'defect_verified'
  | 'job_completed'
  | 'job_completed_early'
  | 'job_quality_bonus'
  | 'review_completed'
  | 'review_thorough'
  | 'streak_maintained'
  | 'streak_milestone'
  | 'achievement_unlocked'
  | 'challenge_completed'
  | 'bonus_star_earned'
  | 'peer_recognition'
  | 'overdue_penalty'
  | 'quality_penalty'
  | 'streak_broken';

export interface PointAward {
  points: number;
  action: PointAction;
  new_total: number;
  reason?: string;
}

export interface PointRule {
  action: PointAction;
  base_points: number;
  description: string;
  role_specific?: string;
  max_daily?: number;
  multipliers?: PointMultiplier[];
}

export interface PointMultiplier {
  field: string;
  operator: '==' | '>=' | '<=' | '>' | '<' | 'in';
  value: any;
  multiplier: number;
}

export interface PointHistory {
  id: number;
  user_id: number;
  points: number;
  reason: string;
  source_type: string;
  source_id?: number;
  created_at: string;
}

// Point action categories for UI grouping
export const POINT_CATEGORIES: Record<string, PointAction[]> = {
  inspection: ['inspection_complete', 'inspection_quality_bonus', 'defect_found', 'critical_defect_found'],
  defect: ['defect_resolved', 'defect_resolved_early', 'defect_verified'],
  job: ['job_completed', 'job_completed_early', 'job_quality_bonus'],
  review: ['review_completed', 'review_thorough'],
  streak: ['streak_maintained', 'streak_milestone'],
  achievement: ['achievement_unlocked', 'challenge_completed'],
  bonus: ['bonus_star_earned', 'peer_recognition'],
  penalty: ['overdue_penalty', 'quality_penalty', 'streak_broken'],
};

// Colors for point actions
export const POINT_ACTION_COLORS: Record<PointAction, string> = {
  inspection_complete: '#52c41a',
  inspection_quality_bonus: '#389e0d',
  defect_found: '#1890ff',
  critical_defect_found: '#722ed1',
  defect_resolved: '#13c2c2',
  defect_resolved_early: '#08979c',
  defect_verified: '#52c41a',
  job_completed: '#52c41a',
  job_completed_early: '#389e0d',
  job_quality_bonus: '#237804',
  review_completed: '#1890ff',
  review_thorough: '#096dd9',
  streak_maintained: '#faad14',
  streak_milestone: '#d48806',
  achievement_unlocked: '#722ed1',
  challenge_completed: '#531dab',
  bonus_star_earned: '#eb2f96',
  peer_recognition: '#c41d7f',
  overdue_penalty: '#ff4d4f',
  quality_penalty: '#cf1322',
  streak_broken: '#a8071a',
};
