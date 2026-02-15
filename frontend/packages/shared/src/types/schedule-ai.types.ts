// Risk scores
export interface EquipmentRiskScore {
  equipment_id: number;
  equipment_name: string;
  risk_score: number;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  factors: {
    age_factor: number;
    failure_history_factor: number;
    criticality_factor: number;
    maintenance_gap_factor: number;
  };
  last_inspection_date: string | null;
  days_since_inspection: number;
  recommended_action: string;
}

export interface RiskScoresResponse {
  equipment_risk_scores: EquipmentRiskScore[];
  summary: {
    total_equipment: number;
    critical_count: number;
    high_count: number;
    average_risk_score: number;
  };
}

export interface CoverageGap {
  equipment_id: number;
  equipment_name: string;
  location: string;
  last_inspection_date: string | null;
  days_overdue: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommended_priority: number;
  estimated_risk: number;
}

export interface CoverageGapsResponse {
  gaps: CoverageGap[];
  total_gaps: number;
  critical_gaps: number;
}

export interface InspectorScore {
  inspector_id: number;
  inspector_name: string;
  quality_score: number;
  completion_rate: number;
  avg_inspection_time: number;
  defect_detection_rate: number;
  trend: 'improving' | 'stable' | 'declining';
  strengths: string[];
  areas_for_improvement: string[];
}

export interface TeamPerformance {
  team_summary: {
    total_inspectors: number;
    avg_quality_score: number;
    avg_completion_rate: number;
    total_inspections_completed: number;
  };
  top_performers: InspectorScore[];
  needs_attention: InspectorScore[];
  team_trends: Array<{
    date: string;
    avg_quality: number;
    completion_rate: number;
  }>;
}

export interface RouteOptimizationRequest {
  equipment_ids: number[];
  inspector_id?: number;
  start_location?: { lat: number; lng: number };
  date?: string;
}

export interface OptimizedRoute {
  total_distance: number;
  total_time_minutes: number;
  route_order: Array<{
    sequence: number;
    equipment_id: number;
    equipment_name: string;
    location: string;
    estimated_time_minutes: number;
    distance_from_previous: number;
  }>;
  optimization_savings: {
    distance_saved_km: number;
    time_saved_minutes: number;
    efficiency_improvement_pct: number;
  };
}

export interface SLAWarning {
  equipment_id: number;
  equipment_name: string;
  sla_due_date: string;
  days_until_due: number;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  recommended_action: string;
  assigned_inspector: string | null;
}

export interface CapacityForecast {
  date: string;
  required_inspections: number;
  available_capacity: number;
  utilization_rate: number;
  is_overloaded: boolean;
  recommendations: string[];
}

export interface HealthTrend {
  equipment_id: number;
  equipment_name: string;
  trend_direction: 'improving' | 'stable' | 'degrading';
  trend_score: number;
  recent_defects: number;
  prediction: string;
  confidence: number;
}

export interface ScheduleAnomaly {
  type: 'frequency_spike' | 'quality_drop' | 'capacity_issue' | 'pattern_change';
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affected_items: string[];
  detected_at: string;
  recommendation: string;
}

export interface ScheduleAIInsight {
  category: 'risk' | 'efficiency' | 'quality' | 'capacity' | 'optimization';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionable_recommendations: string[];
  impact_estimate: string;
  related_data: Record<string, any>;
}

export interface OptimalFrequencyRequest {
  equipment_id: number;
  current_frequency_days?: number;
}

export interface OptimalFrequencyResponse {
  equipment_id: number;
  equipment_name: string;
  current_frequency_days: number;
  recommended_frequency_days: number;
  confidence: number;
  reasoning: string;
  expected_benefits: string[];
  cost_impact: 'increase' | 'decrease' | 'neutral';
}

export interface FatigueRisk {
  inspector_id: number;
  inspector_name: string;
  risk_level: 'high' | 'medium' | 'low';
  factors: {
    consecutive_days_worked: number;
    daily_inspection_load: number;
    overtime_hours: number;
  };
  recommendation: string;
}
