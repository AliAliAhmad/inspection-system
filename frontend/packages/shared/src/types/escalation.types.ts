/**
 * Escalation types for automatic escalation based on rules.
 * Used by Defects, Overdue, SLA tracking, etc.
 */

export type EscalationLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';

export interface EscalationResult {
  entity_type: string;
  entity_id: number | null;
  escalation_level: EscalationLevel;
  escalation_value: number;
  triggered_rules: string[];
  actions: string[];
  notify_roles: string[];
  priority_override: string | null;
  auto_assign_to: string | null;
  evaluated_at: string;
  executed_actions?: string[];
}

// Escalation level colors
export const ESCALATION_COLORS: Record<EscalationLevel, string> = {
  NONE: '#999999',
  LOW: '#52c41a',
  MEDIUM: '#faad14',
  HIGH: '#fa8c16',
  CRITICAL: '#ff4d4f',
  EMERGENCY: '#cf1322',
};

// Tailwind classes
export const ESCALATION_TAILWIND: Record<EscalationLevel, string> = {
  NONE: 'text-gray-500 bg-gray-50',
  LOW: 'text-green-600 bg-green-50',
  MEDIUM: 'text-yellow-600 bg-yellow-50',
  HIGH: 'text-orange-600 bg-orange-50',
  CRITICAL: 'text-red-600 bg-red-50',
  EMERGENCY: 'text-red-800 bg-red-100 animate-pulse',
};
