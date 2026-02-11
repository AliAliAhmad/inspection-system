// Defect AI types for enhanced defect analysis
// Note: DefectSeverity is imported from defect.types.ts
// Note: SLAStatus is imported from sla.types.ts
import type { DefectSeverity } from './defect.types';
import type { SLAStatus } from './sla.types';

// Re-export for convenience
export type { DefectSeverity } from './defect.types';
export type { SLAStatus } from './sla.types';

export interface DefectRiskScore {
  defect_id: number;
  risk_score: number;
  severity: DefectSeverity;
  factors: {
    age_days: number;
    recurrence_count: number;
    equipment_criticality: number;
    area_impact: number;
  };
  recommendation: string;
}

export interface DefectSLAResult {
  defect_id: number;
  status: SLAStatus;
  deadline: string;
  hours_remaining: number;
  hours_elapsed: number;
  is_breached: boolean;
}

export interface DefectEscalation {
  defect_id: number;
  current_level: number;
  should_escalate: boolean;
  escalate_to: string[];
  reason: string;
}

export interface SimilarDefect {
  defect_id: number;
  similarity_score: number;
  title: string;
  description: string;
  resolution: string;
  equipment_serial: string;
}

export interface RootCauseAnalysis {
  defect_id: number;
  probable_causes: string[];
  contributing_factors: string[];
  evidence: string[];
}

export interface DefectInsights {
  total_open: number;
  sla_breached: number;
  high_risk: number;
  trending_types: Array<{ type: string; count: number; trend: 'up' | 'down' | 'stable' }>;
  recommendations: string[];
}
