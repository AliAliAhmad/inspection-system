/**
 * SLA (Service Level Agreement) types for tracking deadlines and status.
 * Reusable across Defects, Inspections, Reviews, etc.
 */

export type SLAStatus = 'on_track' | 'warning' | 'at_risk' | 'breached' | 'critical';

export interface SLAStatusResult {
  entity_type: string;
  severity: string;
  status: SLAStatus;
  status_level: number;
  sla_hours: number;
  deadline: string;
  deadline_display: string;
  percentage: number;
  remaining_seconds: number;
  remaining_display: string;
  elapsed_hours: number;
  is_completed: boolean;
  is_breached: boolean;
  is_at_risk: boolean;
  color: string;
}

export interface SLABulkCheckResult {
  summary: {
    total: number;
    on_track: number;
    warning: number;
    at_risk: number;
    breached: number;
    critical: number;
  };
  results: (SLAStatusResult & { entity_id: number })[];
  breach_rate: number;
}

// SLA color constants for UI
export const SLA_COLORS: Record<SLAStatus, string> = {
  on_track: '#52c41a',   // Green
  warning: '#faad14',     // Yellow
  at_risk: '#fa8c16',     // Orange
  breached: '#ff4d4f',    // Red
  critical: '#cf1322',    // Dark red
};

// Tailwind classes for SLA status
export const SLA_TAILWIND: Record<SLAStatus, string> = {
  on_track: 'text-green-600 bg-green-50 border-green-200',
  warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  at_risk: 'text-orange-600 bg-orange-50 border-orange-200',
  breached: 'text-red-600 bg-red-50 border-red-200',
  critical: 'text-red-800 bg-red-100 border-red-300',
};
