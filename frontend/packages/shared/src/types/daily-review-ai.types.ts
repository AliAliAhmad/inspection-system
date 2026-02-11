export interface RatingSuggestionFactor {
  name: string;
  value: number;
  contribution: number;
  description: string;
}

export interface RatingSuggestion {
  job_id: number;
  user_id: number;
  user_name: string;
  suggested_qc_rating: number;
  suggested_cleaning_rating: number;
  confidence: number;
  reasoning: string;
  factors?: RatingSuggestionFactor[];
}

export interface RatingBiasAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation?: string;
}

export interface RatingBiasResult {
  engineer_id?: number;
  has_sufficient_data?: boolean;
  message?: string;
  sample_size?: number;
  average_rating?: number;
  distribution?: Record<number, number>;
  anomalies?: RatingBiasAnomaly[];
  has_bias?: boolean;
  analyzed_at?: string;
  // Legacy fields
  bias_detected?: boolean;
  standard_deviation?: number;
  comparison_to_peers?: 'above' | 'below' | 'average';
  flagged_patterns?: string[];
}

export interface FeedbackSummary {
  user_id: number;
  period: 'daily' | 'weekly' | 'monthly';
  average_qc_rating: number;
  average_cleaning_rating: number;
  total_jobs: number;
  improvements: string[];
  strengths: string[];
  areas_to_focus: string[];
}

export interface IncompleteJobPrediction {
  job_id: number;
  job_title?: string;
  job_type?: string;
  equipment_name?: string;
  risk_score?: number;
  completion_probability: number;
  risk_factors: string[];
  recommended_action: string;
  prediction?: 'high_risk' | 'medium_risk' | 'low_risk';
}

export interface TimeAccuracyByJobType {
  count: number;
  total_variance: number;
  accuracy: number;
}

export interface TimeAccuracyOverrun {
  job_id: number;
  job_type?: string;
  variance: number;
}

export interface TimeAccuracyAnalysis {
  overall_accuracy: number;
  sample_size: number;
  by_job_type: Record<string, TimeAccuracyByJobType>;
  common_overruns?: TimeAccuracyOverrun[];
  analyzed_at?: string;
  // Legacy fields
  underestimated_percentage?: number;
  overestimated_percentage?: number;
}
