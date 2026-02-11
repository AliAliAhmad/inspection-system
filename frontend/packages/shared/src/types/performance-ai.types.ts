export type GoalType = 'jobs' | 'points' | 'streak' | 'rating' | 'inspections' | 'defects';
export type GoalStatus = 'active' | 'completed' | 'failed' | 'cancelled';

export interface PerformanceGoal {
  id: number;
  user_id: number;
  goal_type: GoalType;
  target_value: number;
  current_value: number;
  progress_percentage: number;
  start_date: string;
  end_date: string;
  days_remaining: number;
  status: GoalStatus;
  is_on_track: boolean | null;
  created_at: string;
  completed_at?: string;
}

export interface PerformanceTrajectory {
  user_id: number;
  current_score: number;
  predicted_scores: Array<{ month: string; score: number }>;
  trend: 'improving' | 'declining' | 'stable';
  factors_affecting: string[];
}

// Note: SkillGap exists in work-plan.types.ts for team/workforce gaps
// This interface is for individual performance skill gap analysis
export interface PerformanceSkillGap {
  skill: string;
  current_level: number;
  target_level: number;
  gap: number;
  priority: 'high' | 'medium' | 'low';
  recommended_actions: string[];
}

export interface BurnoutRisk {
  user_id: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  indicators: string[];
  recommended_interventions: string[];
}

export interface CoachingTip {
  category: string;
  tip: string;
  priority: number;
  resources?: string[];
}

export interface PeerComparison {
  user_id: number;
  rank: number;
  total_peers: number;
  percentile: number;
  metrics: {
    jobs_completed: { value: number; vs_average: number };
    quality_rating: { value: number; vs_average: number };
    on_time_rate: { value: number; vs_average: number };
  };
}

export interface LearningPath {
  user_id: number;
  recommended_courses: Array<{
    title: string;
    description: string;
    duration_hours: number;
    priority: number;
    skills_covered: string[];
  }>;
}
