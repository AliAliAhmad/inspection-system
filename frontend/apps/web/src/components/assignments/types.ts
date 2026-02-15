// Inspector Scoreboard Types
export interface InspectorScore {
  inspector_id: number;
  inspector_name: string;
  quality_score: number;
  completion_rate: number;
  trend: 'improving' | 'declining' | 'stable';
  strengths: string[];
  areas_to_improve: string[];
  total_inspections: number;
  avg_inspection_time: number;
  defect_detection_rate: number;
}

// Team Performance Types
export interface TeamPerformance {
  total_inspections: number;
  completion_rate: number;
  completion_rate_change: number;
  avg_quality_score: number;
  avg_completion_time: number;
  target_completion_time: number;
  completion_trend: CompletionTrendPoint[];
  quality_trend: QualityTrendPoint[];
  category_distribution: CategoryDistribution[];
  inspector_comparison: InspectorComparison[];
}

export interface CompletionTrendPoint {
  date: string;
  completed: number;
  pending: number;
  overdue: number;
}

export interface QualityTrendPoint {
  date: string;
  score: number;
  target: number;
}

export interface CategoryDistribution {
  name: string;
  value: number;
}

export interface InspectorComparison {
  name: string;
  quality: number;
  completion: number;
}

// Fatigue Alert Types
export interface FatigueAlert {
  id: number;
  inspector_id: number;
  inspector_name: string;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  fatigue_score: number;
  hours_worked_today: number;
  consecutive_days: number;
  reason: string;
  recommendations: string[];
  created_at: string;
}

export interface InspectorFatigueData {
  inspector_id: number;
  inspector_name: string;
  fatigue_score: number;
  hours_worked_today: number;
  hours_worked_week: number;
  consecutive_days: number;
  last_break: string;
  workload_distribution: WorkloadDistribution[];
}

export interface WorkloadDistribution {
  day: string;
  hours: number;
}

// Route Optimization Types
export interface RouteOptimization {
  routes: OptimizedRoute[];
  total_time_savings_minutes: number;
  total_distance_savings_km: number;
  optimization_goal: 'time' | 'distance' | 'balanced';
  generated_at: string;
}

export interface OptimizedRoute {
  id: number;
  inspector_id: number;
  inspector_name: string;
  stops: RouteStop[];
  total_distance_km: number;
  total_duration_minutes: number;
  estimated_end_time: string;
  has_improvements: boolean;
  time_savings_minutes: number;
  distance_savings_km: number;
  improvement_percentage: number;
  original_sequence: number[];
  optimized_sequence: number[];
  warnings: string[];
}

export interface RouteStop {
  id: number;
  assignment_id: number;
  location_name: string;
  address: string;
  latitude: number;
  longitude: number;
  estimated_arrival: string;
  duration_minutes: number;
  distance_to_next_km: number;
  priority: 'high' | 'normal' | 'low';
  is_completed: boolean;
  is_current: boolean;
}

// API Request/Response Types
export interface RouteOptimizationRequest {
  inspector_id?: number;
  optimization_goal: 'time' | 'distance' | 'balanced';
  date?: string;
}

export interface InspectorListItem {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
}
