import { User } from './user.types';
import { Equipment } from './equipment.types';
import { Defect } from './defect.types';

export type WorkPlanStatus = 'draft' | 'published';
export type JobType = 'pm' | 'defect' | 'inspection';
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';
export type Berth = 'east' | 'west' | 'both';

export interface Material {
  id: number;
  code: string;
  name: string;
  name_en: string;
  name_ar: string | null;
  category: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  monthly_consumption: number;
  stock_months: number | null;
  is_low_stock: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaterialKitItem {
  id: number;
  kit_id: number;
  material_id: number;
  material: Material | null;
  quantity: number;
}

export interface MaterialKit {
  id: number;
  name: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  equipment_type: string | null;
  is_active: boolean;
  items: MaterialKitItem[];
  created_at: string;
}

export interface WorkPlanMaterial {
  id: number;
  work_plan_job_id: number;
  material_id: number;
  material: Material | null;
  quantity: number;
  from_kit_id: number | null;
  from_kit: string | null;
  actual_quantity: number | null;
  consumed_at: string | null;
  created_at: string;
}

export interface WorkPlanAssignment {
  id: number;
  work_plan_job_id: number;
  user_id: number;
  user: {
    id: number;
    full_name: string;
    role: string;
    role_id: string;
    specialization: string | null;
  } | null;
  is_lead: boolean;
  created_at: string;
}

export interface WorkPlanJob {
  id: number;
  work_plan_day_id: number;
  job_type: JobType;
  berth: Berth | null;
  equipment_id: number | null;
  equipment: Equipment | null;
  defect_id: number | null;
  defect: Defect | null;
  inspection_assignment_id: number | null;
  inspection_assignment: any | null;
  sap_order_number: string | null;
  estimated_hours: number;
  position: number;
  priority: JobPriority;
  notes: string | null;
  assignments: WorkPlanAssignment[];
  materials: WorkPlanMaterial[];
  assigned_users_count: number;
  related_defects?: Defect[];
  related_defects_count?: number;
  created_at: string;
}

export interface WorkPlanDay {
  id: number;
  work_plan_id: number;
  date: string;
  day_name: string;
  notes: string | null;
  total_jobs: number;
  total_hours: number;
  jobs: WorkPlanJob[];
  jobs_east: WorkPlanJob[];
  jobs_west: WorkPlanJob[];
  jobs_both: WorkPlanJob[];
  created_at: string;
}

export interface WorkPlan {
  id: number;
  week_start: string;
  week_end: string;
  status: WorkPlanStatus;
  created_by_id: number;
  created_by: User | null;
  published_at: string | null;
  published_by_id: number | null;
  pdf_file_id: number | null;
  pdf_url: string | null;
  notes: string | null;
  total_jobs: number;
  jobs_by_day: Record<string, number>;
  days?: WorkPlanDay[];
  created_at: string;
  updated_at: string;
}

export interface MyWorkPlanDay {
  date: string;
  day_name: string;
  jobs: (WorkPlanJob & { is_lead: boolean; day_date: string; day_name: string })[];
}

export interface MyWorkPlanResponse {
  work_plan: {
    id: number;
    week_start: string;
    week_end: string;
    status: string;
    pdf_url: string | null;
  } | null;
  my_jobs: MyWorkPlanDay[];
  total_jobs: number;
}

// Request payloads
export interface CreateWorkPlanPayload {
  week_start: string;
  notes?: string;
}

export interface AddJobPayload {
  day_id?: number;
  date?: string;
  job_type: JobType;
  berth?: Berth;
  equipment_id?: number;
  defect_id?: number;
  inspection_assignment_id?: number;
  sap_order_number?: string;
  estimated_hours: number;
  priority?: JobPriority;
  notes?: string;
}

export interface UpdateJobPayload {
  berth?: Berth;
  estimated_hours?: number;
  priority?: JobPriority;
  notes?: string;
  position?: number;
  sap_order_number?: string;
}

export interface AssignUserPayload {
  user_id: number;
  is_lead?: boolean;
}

export interface AddMaterialPayload {
  material_id?: number;
  quantity?: number;
  kit_id?: number;
}

export interface CreateMaterialPayload {
  code: string;
  name: string;
  name_ar?: string;
  category: string;
  unit: string;
  current_stock?: number;
  min_stock?: number;
}

export interface CreateMaterialKitPayload {
  name: string;
  name_ar?: string;
  description?: string;
  equipment_type?: string;
  items: { material_id: number; quantity: number }[];
}

// Available jobs for planning
export interface AvailablePMJob {
  equipment: Equipment;
  job_type: 'pm';
  related_defects_count: number;
}

export interface AvailableDefectJob {
  defect: Defect;
  job_type: 'defect';
  equipment: Equipment | null;
}

export interface AvailableInspectionJob {
  assignment: any;
  job_type: 'inspection';
}

export interface AvailableJobsResponse {
  pm_jobs: AvailablePMJob[];
  defect_jobs: AvailableDefectJob[];
  inspection_jobs: AvailableInspectionJob[];
}
