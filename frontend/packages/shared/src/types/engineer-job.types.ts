export type EngineerJobType = 'custom_project' | 'system_review' | 'special_task';

export interface EngineerJob {
  id: number;
  universal_id: number;
  job_id: string;
  engineer_id: number;
  job_type: EngineerJobType;
  equipment_id: number | null;
  title: string;
  description: string;
  category: 'major' | 'minor' | null;
  major_reason: string | null;
  planned_time_days: number | null;
  planned_time_hours: number | null;
  started_at: string | null;
  completed_at: string | null;
  actual_time_hours: number | null;
  status: string;
  work_notes: string | null;
  completion_status: string | null;
  time_rating: number | null;
  qc_rating: number | null;
  admin_bonus: number;
  qe_id: number | null;
  is_running?: boolean;
  has_pending_pause?: boolean;
  created_at: string;
}

export interface CreateEngineerJobPayload {
  engineer_id?: number;
  job_type: EngineerJobType;
  title: string;
  description: string;
  equipment_id?: number;
  category?: 'major' | 'minor';
  major_reason?: string;
}

export interface EngineerJobStats {
  total_jobs: number;
  completed_jobs: number;
  in_progress_jobs: number;
  paused_jobs: number;
  avg_completion_time_hours: number;
  on_time_rate: number;
  efficiency_score: number;
  streak_days: number;
  points_earned: number;
  trend: {
    jobs_change: number;
    efficiency_change: number;
  };
}

export interface EngineerPerformance {
  daily_completions: Array<{ date: string; count: number }>;
  category_breakdown: Array<{ category: string; count: number; avg_time: number }>;
  quality_score: number;
}

export interface EngineerAIInsight {
  type: 'tip' | 'warning' | 'achievement';
  title: string;
  description: string;
  priority: number;
  action?: string;
  actionUrl?: string;
}
