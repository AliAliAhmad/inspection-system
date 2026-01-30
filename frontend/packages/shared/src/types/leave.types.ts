import { User } from './user.types';

export type LeaveType = 'sick' | 'annual' | 'emergency' | 'training' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface Leave {
  id: number;
  user_id: number;
  user: User | null;
  leave_type: LeaveType;
  other_reason: string | null;
  date_from: string;
  date_to: string;
  total_days: number;
  reason: string | null;
  scope: 'major_only' | 'full';
  status: LeaveStatus;
  approved_by_id: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  coverage_user_id: number | null;
  coverage_user: User | null;
  created_at: string;
}

export interface LeaveRequestPayload {
  leave_type: LeaveType;
  date_from: string;
  date_to: string;
  reason: string;
  scope?: 'major_only' | 'full';
}
