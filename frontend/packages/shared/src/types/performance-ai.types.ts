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
  user_name?: string;
  current_score?: number;
  current_rank?: number;
  current_points?: number;
  predicted_scores?: Array<{ month: string; score: number }>;
  predictions?: Array<{
    month: number;
    date: string;
    predicted_points: number;
    predicted_rank: number;
  }>;
  trend: 'improving' | 'declining' | 'stable';
  avg_monthly_growth?: number;
  confidence?: number;
  has_sufficient_data?: boolean;
  message?: string;
  factors_affecting?: string[];
  generated_at?: string;
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

export interface BurnoutRiskFactor {
  factor: string;
  value: number | boolean;
  description: string;
  contribution: number;
}

export interface BurnoutRisk {
  user_id: number;
  user_name?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_score?: number;
  indicators?: string[];
  factors?: BurnoutRiskFactor[];
  recommendations?: string[];
  recommended_interventions?: string[];
  assessed_at?: string;
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
