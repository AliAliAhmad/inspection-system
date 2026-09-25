export type OverdueEntityType = 'inspection' | 'defect' | 'review';

export interface OverdueSummary {
  inspections: { count: number; oldest_days: number };
  defects: { count: number; oldest_days: number };
  reviews: { count: number; oldest_days: number };
  total: number;
}

/** One bucket of GET /api/overdue/aging (names: 1_3_days, 4_7_days, 8_14_days, 15_plus_days). */
export interface AgingBucketData {
  name: string;
  label: string;
  min_days: number;
  max_days: number | null;
  count: number;
  percentage: number;
  color: string;
}

/** GET /api/overdue/aging — buckets are computed from the same rows the list endpoints return. */
export interface AgingBucketsResponse {
  buckets: AgingBucketData[];
  total_overdue: number;
  average_days_overdue: number;
  oldest_item_days: number;
  trend: 'improving' | 'stable' | 'worsening';
  analyzed_at: string;
}

/** A row of GET /api/overdue/inspections. */
export interface OverdueInspectionRow {
  id: number;
  type: 'inspection_assignment';
  equipment_id: number | null;
  equipment_name: string | null;
  mechanical_inspector_id: number | null;
  mechanical_inspector: string | null;
  electrical_inspector_id: number | null;
  electrical_inspector: string | null;
  status: string;
  deadline: string | null;
  days_overdue: number;
  risk_score: number;
  risk_level: string;
  created_at: string | null;
}

/** A row of GET /api/overdue/defects. */
export interface OverdueDefectRow {
  id: number;
  type: 'defect';
  description: string;
  severity: string | null;
  priority: string | null;
  status: string;
  assigned_to_id: number | null;
  assigned_to: string | null;
  due_date: string | null;
  days_overdue: number;
  sla_percentage: number;
  sla_status: string;
  risk_score: number;
  risk_level: string;
  created_at: string | null;
}

/** A row of GET /api/overdue/reviews. */
export interface OverdueReviewRow {
  id: number;
  type: 'quality_review';
  job_type: string;
  job_id: number;
  qe_id: number | null;
  quality_engineer: string | null;
  status: string;
  sla_deadline: string | null;
  days_overdue: number;
  sla_percentage: number;
  sla_status: string;
  created_at: string | null;
}

export interface OverduePattern {
  pattern_type: string;
  description: string;
  frequency: number;
  affected_areas: string[];
  recommendation: string;
}

export interface OverdueRiskPrediction {
  entity_type: OverdueEntityType;
  entity_id: number;
  risk_score: number;
  predicted_overdue_days: number;
  factors: string[];
}
