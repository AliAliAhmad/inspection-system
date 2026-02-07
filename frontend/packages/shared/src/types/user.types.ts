export type UserRole = 'admin' | 'inspector' | 'specialist' | 'engineer' | 'quality_engineer' | 'maintenance';
export type Specialization = 'mechanical' | 'electrical' | null;

export interface User {
  id: number;
  sap_id: string | null;
  username: string;
  email: string;
  full_name: string;
  employee_id: string;
  role_id: string;
  role: UserRole;
  minor_role: UserRole | null;
  minor_role_id: string | null;
  specialization: Specialization;
  shift: 'day' | 'night' | null;
  language: 'en' | 'ar';
  is_active: boolean;
  is_on_leave: boolean;
  annual_leave_balance: number;
  leave_coverage_for: number | null;
  inspector_points: number;
  specialist_points: number;
  total_points: number;
  must_change_password: boolean;
  created_by_id: number | null;
  created_at: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  minor_role?: UserRole;
  specialization?: Specialization;
  shift?: 'day' | 'night';
  language?: 'en' | 'ar';
}

export interface UpdateUserPayload {
  email?: string;
  full_name?: string;
  role?: UserRole;
  minor_role?: UserRole;
  specialization?: Specialization;
  shift?: 'day' | 'night';
  language?: 'en' | 'ar';
  is_active?: boolean;
}

// Import/Export types
export interface ImportLog {
  id: number;
  import_type: 'team' | 'equipment';
  admin_id: number;
  admin_name: string | null;
  file_name: string | null;
  total_rows: number;
  created_count: number;
  updated_count: number;
  failed_count: number;
  details: ImportFailedRow[] | null;
  created_at: string;
}

export interface ImportFailedRow {
  row: number;
  sap_id?: string;
  serial_number?: string;
  full_name?: string;
  name?: string;
  errors: string[];
}

export interface ImportResultRow {
  row: number;
  sap_id?: string;
  serial_number?: string;
  full_name?: string;
  name?: string;
  username?: string;
  role_id?: string;
  minor_role_id?: string;
  equipment_type?: string;
}

export interface ImportResult {
  created: ImportResultRow[];
  updated: ImportResultRow[];
  failed: ImportFailedRow[];
}

export interface RoleSwapLog {
  id: number;
  user_id: number;
  user_name: string | null;
  admin_id: number;
  admin_name: string | null;
  old_role: UserRole;
  old_role_id: string;
  old_minor_role: UserRole | null;
  old_minor_role_id: string | null;
  new_role: UserRole;
  new_role_id: string;
  new_minor_role: UserRole | null;
  new_minor_role_id: string | null;
  created_at: string;
}
