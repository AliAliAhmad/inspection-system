export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface LeaderboardEntry {
  user_id: number;
  full_name: string;
  employee_id?: string;
  role: string;
  rank: number;
  rank_change?: number;  // +3, -1, 0
  total_points: number;
  level: number;
  tier: Tier;
  current_streak: number;
  achievements_count: number;
  avg_rating?: number;
}

export interface UserStats {
  level: number;
  tier: string;
  current_xp: number;
  xp_to_next: number;
  xp_progress_percent: number;
  total_points: number;
  rank: number;
  rank_change: number;
  current_streak: number;
  longest_streak: number;
  achievements_count: number;
  inspections_count: number;
  jobs_count: number;
  avg_rating: number;
}

export interface LeaderboardAchievement {
  id: number;
  code: string;
  name: string;
  name_ar?: string;
  description: string;
  icon: string;
  category: string;
  points_reward: number;
  tier: string;
  is_hidden: boolean;
  progress?: number;
  target?: number;
  earned_at?: string;
}

export interface Challenge {
  id: number;
  code: string;
  name: string;
  description: string;
  challenge_type: 'weekly' | 'monthly' | 'special';
  target_type: string;
  target_value: number;
  points_reward: number;
  start_date: string;
  end_date: string;
  days_remaining: number;
  my_progress?: number;
  is_joined?: boolean;
  participants_count: number;
}

export interface PointHistoryEntry {
  id: number;
  points: number;
  reason: string;
  source_type: string;
  multiplier: number;
  created_at: string;
}

export interface AIInsight {
  insight: string;
  type: 'pattern' | 'improvement' | 'goal' | 'warning';
  priority?: string;
}

export interface RankPrediction {
  predicted_rank: number;
  confidence: number;
  reasoning: string;
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string;
  streak_frozen: boolean;
}

export interface TierInfo {
  tier: Tier;
  min_points: number;
  max_points: number;
  perks: string[];
}

export interface PointBreakdown {
  source: string;
  points: number;
  percentage: number;
  count: number;
}

export interface HistoricalData {
  date: string;
  points: number;
  rank: number;
}

export interface CreateChallengePayload {
  code: string;
  name: string;
  description: string;
  challenge_type: 'weekly' | 'monthly' | 'special';
  target_type: string;
  target_value: number;
  points_reward: number;
  start_date: string;
  end_date: string;
}

export interface AwardPointsPayload {
  user_id: number;
  points: number;
  reason: string;
}
