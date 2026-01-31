export type UserRole = 'admin' | 'inspector' | 'specialist' | 'engineer' | 'quality_engineer';
export type Specialization = 'mechanical' | 'electrical' | null;

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  employee_id: string;
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
