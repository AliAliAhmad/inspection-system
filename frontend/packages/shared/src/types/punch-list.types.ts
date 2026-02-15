/** Punch List Types */

export type PunchListPriority = 'high' | 'medium' | 'low';
export type PunchListStatus = 'open' | 'in_progress' | 'resolved' | 'verified' | 'cancelled';

export interface PunchListItem {
  id: number;
  defect_id: number;
  priority: PunchListPriority;
  status: PunchListStatus;
  assigned_to: number | null;
  assigned_user?: {
    id: number;
    full_name: string;
    role: string;
  } | null;
  notes: string;
  notes_ar?: string;
  due_date: string | null;
  completed_at: string | null;
  verified_at: string | null;
  verified_by: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  // Related defect summary
  defect?: {
    id: number;
    description: string;
    severity: string;
    status: string;
    equipment_id: number | null;
    equipment_name?: string;
  };
}

export interface CreatePunchListItemPayload {
  defect_id: number;
  priority: PunchListPriority;
  notes: string;
  notes_ar?: string;
  assigned_to?: number;
  due_date?: string;
}

export interface UpdatePunchListItemPayload {
  priority?: PunchListPriority;
  status?: PunchListStatus;
  notes?: string;
  notes_ar?: string;
  assigned_to?: number | null;
  due_date?: string | null;
}

export interface PunchListListParams {
  status?: PunchListStatus;
  priority?: PunchListPriority;
  assigned_to?: number;
  defect_id?: number;
  equipment_id?: number;
  overdue?: boolean;
  page?: number;
  per_page?: number;
}

export interface PunchListStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  verified: number;
  overdue: number;
  by_priority: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface BulkPunchListAction {
  item_ids: number[];
  action: 'assign' | 'update_priority' | 'update_status' | 'cancel';
  assigned_to?: number;
  priority?: PunchListPriority;
  status?: PunchListStatus;
}

export interface BulkPunchListResult {
  success_count: number;
  failed_count: number;
  failed_items: {
    id: number;
    error: string;
  }[];
}
