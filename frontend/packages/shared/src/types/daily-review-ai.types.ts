export interface RatingSuggestion {
  job_id: number;
  user_id: number;
  user_name: string;
  suggested_qc_rating: number;
  suggested_cleaning_rating: number;
  confidence: number;
  reasoning: string;
}

export interface RatingBiasResult {
  engineer_id: number;
  bias_detected: boolean;
  average_rating: number;
  standard_deviation: number;
  comparison_to_peers: 'above' | 'below' | 'average';
  flagged_patterns: string[];
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
  job_title: string;
  completion_probability: number;
  risk_factors: string[];
  recommended_action: string;
}

export interface TimeAccuracyAnalysis {
  overall_accuracy: number;
  underestimated_percentage: number;
  overestimated_percentage: number;
  by_job_type: Array<{
    type: string;
    accuracy: number;
    average_variance_hours: number;
  }>;
}
