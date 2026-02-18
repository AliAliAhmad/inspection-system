import { Verdict } from './assessment.types';

export type FollowupStatus =
  | 'pending_schedule'
  | 'scheduled'
  | 'assignment_created'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'cancelled';

export type FollowupType = 'routine_check' | 'detailed_inspection' | 'operational_test';

export type FollowupLocation = 'east' | 'west';

export interface MonitorFollowup {
  id: number;
  assessment_id: number;
  equipment_id: number;
  equipment_name: string | null;
  parent_followup_id: number | null;
  followup_date: string;
  followup_type: FollowupType;
  location: FollowupLocation;
  shift: 'day' | 'night' | null;
  mechanical_inspector_id: number | null;
  mechanical_inspector_name: string | null;
  electrical_inspector_id: number | null;
  electrical_inspector_name: string | null;
  scheduled_by: number | null;
  scheduled_by_name: string | null;
  scheduled_by_role: 'engineer' | 'admin' | null;
  notes: string | null;
  inspection_assignment_id: number | null;
  status: FollowupStatus;
  result_verdict: Verdict | null;
  result_assessment_id: number | null;
  is_overdue: boolean;
  overdue_since: string | null;
  overdue_notifications_sent: number;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
}

export interface ScheduleFollowupPayload {
  followup_date: string;
  followup_type: FollowupType;
  location: FollowupLocation;
  shift?: 'day' | 'night';
  mechanical_inspector_id?: number;
  electrical_inspector_id?: number;
  notes?: string;
}

export interface AvailableInspector {
  id: number;
  name: string;
  employee_id: string | null;
  role: string;
  specialization: string | null;
  workload: number;
}

export interface AvailableInspectorsResponse {
  mechanical: AvailableInspector[];
  electrical: AvailableInspector[];
}

export interface FollowupDashboardStats {
  pending_schedule: number;
  scheduled: number;
  overdue: number;
  in_progress: number;
  completed_this_month: number;
  total_active: number;
}

export interface FollowupListParams {
  status?: FollowupStatus;
  equipment_id?: number;
}
