export type OverdueEntityType = 'inspection' | 'defect' | 'review';
export type AgingBucket = '1-7' | '8-14' | '15-30' | '31-60' | '60+';

export interface OverdueSummary {
  inspections: { count: number; oldest_days: number };
  defects: { count: number; oldest_days: number };
  reviews: { count: number; oldest_days: number };
  total: number;
}

export interface OverdueItem {
  id: number;
  type: OverdueEntityType;
  title: string;
  due_date: string;
  days_overdue: number;
  priority: 'normal' | 'high' | 'critical';
  assigned_to?: string;
  equipment_serial?: string;
}

export interface AgingBucketData {
  bucket: AgingBucket;
  count: number;
  percentage: number;
  items: OverdueItem[];
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
