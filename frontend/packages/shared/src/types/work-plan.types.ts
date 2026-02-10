import { User } from './user.types';
import { Equipment } from './equipment.types';
import { Defect } from './defect.types';

export type WorkPlanStatus = 'draft' | 'published';
export type JobType = 'pm' | 'defect' | 'inspection';
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ComputedPriority = 'normal' | 'high' | 'critical';
export type Berth = 'east' | 'west' | 'both';
export type CycleType = 'running_hours' | 'calendar';
export type CalendarUnit = 'days' | 'weeks' | 'months';

// ==================== MAINTENANCE CYCLES ====================

export interface MaintenanceCycle {
  id: number;
  name: string;
  name_ar: string | null;
  cycle_type: CycleType;
  hours_value: number | null;
  calendar_value: number | null;
  calendar_unit: CalendarUnit | null;
  display_label: string;
  display_label_en: string;
  display_label_ar: string | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
}

// ==================== PM TEMPLATES ====================

export interface PMTemplateChecklistItem {
  id: number;
  template_id: number;
  item_code: string | null;
  question_text: string;
  question_text_en: string;
  question_text_ar: string | null;
  answer_type: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
  category: 'mechanical' | 'electrical' | null;
  is_required: boolean;
  order_index: number;
  action: string | null;
  action_en: string | null;
  action_ar: string | null;
}

export interface PMTemplateMaterial {
  id: number;
  template_id: number;
  material_id: number;
  material: Material | null;
  quantity: number;
}

export interface PMTemplate {
  id: number;
  name: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  description_en: string | null;
  description_ar: string | null;
  equipment_type: string;
  cycle_id: number;
  cycle: MaintenanceCycle | null;
  estimated_hours: number;
  is_active: boolean;
  checklist_items: PMTemplateChecklistItem[];
  checklist_items_count: number;
  materials: PMTemplateMaterial[];
  materials_count: number;
  created_by_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ==================== MATERIALS ====================

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
  description: string | null;
  cycle_id: number | null;
  cycle: MaintenanceCycle | null;
  pm_template_id: number | null;
  pm_template: PMTemplate | null;
  overdue_value: number | null;
  overdue_unit: 'hours' | 'days' | null;
  computed_priority: ComputedPriority;
  maintenance_base: string | null;
  planned_date: string | null;
  start_time: string | null;
  end_time: string | null;
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
  // Extended fields for enhanced work planning
  template_id?: number;
  template?: JobTemplate;
  checklist_required: boolean;
  checklist_completed: boolean;
  completion_photo_required: boolean;
  weather_sensitive: boolean;
  is_split: boolean;
  split_from_id?: number;
  split_part?: number;
  actual_start_time?: string;
  actual_end_time?: string;
  dependencies?: JobDependency[];
  checklist_responses?: JobChecklistResponse[];
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
  description?: string;
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

export interface MoveJobPayload {
  target_day_id: number;
  position?: number;
  start_time?: string;
}

export interface MoveJobResponse {
  job: WorkPlanJob;
  old_day_id: number;
  new_day_id: number;
}

// ==================== CYCLES PAYLOADS ====================

export interface CreateCyclePayload {
  name: string;
  name_ar?: string;
  cycle_type: CycleType;
  hours_value?: number;
  calendar_value?: number;
  calendar_unit?: CalendarUnit;
  display_label?: string;
  display_label_ar?: string;
}

export interface UpdateCyclePayload {
  name?: string;
  name_ar?: string;
  hours_value?: number;
  calendar_value?: number;
  calendar_unit?: CalendarUnit;
  display_label?: string;
  display_label_ar?: string;
  is_active?: boolean;
  sort_order?: number;
}

// ==================== PM TEMPLATES PAYLOADS ====================

export interface CreatePMTemplatePayload {
  name: string;
  name_ar?: string;
  description?: string;
  description_ar?: string;
  equipment_type: string;
  cycle_id: number;
  estimated_hours?: number;
  checklist_items?: {
    item_code?: string;
    question_text: string;
    question_text_ar?: string;
    answer_type?: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
    category?: 'mechanical' | 'electrical';
    is_required?: boolean;
    order_index?: number;
    action?: string;
    action_ar?: string;
  }[];
  materials?: { material_id: number; quantity: number }[];
}

export interface UpdatePMTemplatePayload {
  name?: string;
  name_ar?: string;
  description?: string;
  description_ar?: string;
  equipment_type?: string;
  cycle_id?: number;
  estimated_hours?: number;
  is_active?: boolean;
  checklist_items?: {
    item_code?: string;
    question_text: string;
    question_text_ar?: string;
    answer_type?: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
    category?: 'mechanical' | 'electrical';
    is_required?: boolean;
    order_index?: number;
    action?: string;
    action_ar?: string;
  }[];
  materials?: { material_id: number; quantity: number }[];
}

export interface ClonePMTemplatePayload {
  cycle_id: number;
  name?: string;
  name_ar?: string;
}

// SAP Work Order (in staging/pool)
export interface SAPWorkOrder {
  id: number;
  work_plan_id: number;
  order_number: string;
  order_type: string;
  job_type: JobType;
  equipment_id: number;
  equipment: Equipment | null;
  description: string | null;
  estimated_hours: number;
  priority: JobPriority;
  berth: Berth | null;
  cycle_id: number | null;
  cycle: MaintenanceCycle | null;
  maintenance_base: string | null;
  required_date: string | null;
  planned_date: string | null;
  overdue_value: number | null;
  overdue_unit: string | null;
  notes: string | null;
  status: 'pending' | 'scheduled';
  created_at: string;
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
  sap_orders: SAPWorkOrder[];
}

// ==================== JOB TEMPLATES ====================

export interface JobTemplate {
  id: number;
  name: string;
  name_ar?: string;
  job_type: 'pm' | 'defect' | 'inspection';
  equipment_id?: number;
  equipment?: { id: number; name: string; serial_number: string };
  equipment_type?: string;
  berth?: 'east' | 'west' | 'both';
  estimated_hours: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  description?: string;
  description_ar?: string;
  recurrence_type?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  recurrence_day?: number;
  default_team_size: number;
  required_certifications?: string[];
  is_active: boolean;
  created_by_id?: number;
  materials?: JobTemplateMaterial[];
  checklist_items?: JobTemplateChecklist[];
  created_at: string;
  updated_at: string;
}

export interface JobTemplateMaterial {
  id: number;
  template_id: number;
  material_id: number;
  material?: { id: number; name: string; code: string };
  quantity: number;
  is_optional: boolean;
}

export interface JobTemplateChecklist {
  id: number;
  template_id: number;
  item_code?: string;
  question: string;
  question_ar?: string;
  answer_type: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
  is_required: boolean;
  order_index: number;
  fail_action?: string;
  fail_action_ar?: string;
}

// ==================== JOB DEPENDENCIES ====================

export interface JobDependency {
  id: number;
  job_id: number;
  depends_on_job_id: number;
  depends_on_job?: WorkPlanJob;
  dependency_type: 'finish_to_start' | 'start_to_start';
  lag_minutes: number;
  created_at: string;
}

// ==================== CAPACITY CONFIG ====================

export interface CapacityConfig {
  id: number;
  name: string;
  role?: string;
  shift?: 'day' | 'night';
  max_hours_per_day: number;
  max_jobs_per_day: number;
  min_rest_hours: number;
  overtime_threshold_hours: number;
  max_overtime_hours: number;
  break_duration_minutes: number;
  break_after_hours: number;
  concurrent_jobs_allowed: number;
  is_active: boolean;
}

// ==================== WORKER SKILLS ====================

export interface WorkerSkill {
  id: number;
  user_id: number;
  user?: { id: number; full_name: string };
  skill_name: string;
  skill_level: 1 | 2 | 3 | 4 | 5;
  certification_name?: string;
  certification_number?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  document_file_id?: number;
  is_verified: boolean;
  verified_by_id?: number;
  verified_at?: string;
  is_expired?: boolean;
  days_until_expiry?: number;
}

// ==================== EQUIPMENT RESTRICTIONS ====================

export interface EquipmentRestriction {
  id: number;
  equipment_id: number;
  equipment?: { id: number; name: string };
  restriction_type: 'blackout' | 'crew_size' | 'skill_required' | 'shift_only';
  value: any;
  reason?: string;
  start_date?: string;
  end_date?: string;
  is_permanent: boolean;
  is_active: boolean;
  is_currently_active?: boolean;
  created_by_id?: number;
}

// ==================== WORK PLAN VERSIONS ====================

export interface WorkPlanVersion {
  id: number;
  work_plan_id: number;
  version_number: number;
  snapshot_data: any;
  change_summary?: string;
  change_type: 'created' | 'jobs_added' | 'jobs_moved' | 'jobs_removed' | 'published' | 'updated';
  created_by_id?: number;
  created_by?: { id: number; full_name: string };
  created_at: string;
}

// ==================== JOB CHECKLIST RESPONSES ====================

export interface JobChecklistResponse {
  id: number;
  work_plan_job_id: number;
  checklist_item_id?: number;
  question: string;
  answer_type: string;
  answer_value?: string;
  is_passed?: boolean;
  notes?: string;
  photo_file_id?: number;
  answered_by_id?: number;
  answered_by?: { id: number; full_name: string };
  answered_at: string;
}

// ==================== SCHEDULING CONFLICTS ====================

export interface SchedulingConflict {
  id: number;
  work_plan_id: number;
  conflict_type: 'capacity' | 'overlap' | 'skill' | 'equipment' | 'dependency';
  severity: 'info' | 'warning' | 'error';
  description: string;
  affected_job_ids?: number[];
  affected_user_ids?: number[];
  resolution?: string;
  resolved_at?: string;
  resolved_by_id?: number;
  is_ignored: boolean;
  is_resolved?: boolean;
  is_blocking?: boolean;
  created_at: string;
}

// ==================== AI PREDICTIONS & SUGGESTIONS ====================

export interface TeamSuggestion {
  user_id: number;
  user_name: string;
  score: number;
  reasons: string[];
  past_performance_on_similar?: number;
}

export interface JobDurationPrediction {
  estimated_hours: number;
  confidence: number;
  range: { min: number; max: number };
  factors: string[];
}

export interface DelayRiskPrediction {
  risk_level: 'low' | 'medium' | 'high';
  probability: number;
  factors: string[];
  mitigation_suggestions: string[];
}

export interface CompletionPrediction {
  predicted_rate: number;
  confidence: number;
  at_risk_jobs: Array<{ job_id: number; reason: string }>;
  recommendations: string[];
}

export interface WorkloadForecast {
  week_start: string;
  predicted_jobs: number;
  predicted_hours: number;
  confidence: number;
}

export interface ScheduleAnomaly {
  type: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
  affected_items: any[];
  suggestion?: string;
}

export interface SchedulingBottleneck {
  type: string;
  description: string;
  impact: string;
  affected_jobs: number[];
  solution?: string;
}

export interface LiveStatusSummary {
  completion_rate: number;
  on_track_jobs: number;
  delayed_jobs: number;
  at_risk_jobs: number;
  estimated_completion_time?: string;
  recommendations: string[];
}

export interface SkillGap {
  skill: string;
  current_workers: number;
  needed_workers: number;
  training_priority: 'low' | 'medium' | 'high';
}

export interface EfficiencyScore {
  score: number;
  breakdown: Record<string, number>;
  comparison_to_avg: number;
  suggestions: string[];
}

export interface PlanValidation {
  valid: boolean;
  errors: SchedulingConflict[];
  warnings: SchedulingConflict[];
}

// ==================== ENHANCED PAYLOADS ====================

export interface CreateTemplatePayload {
  name: string;
  name_ar?: string;
  job_type: 'pm' | 'defect' | 'inspection';
  equipment_id?: number;
  equipment_type?: string;
  berth?: string;
  estimated_hours: number;
  priority?: string;
  description?: string;
  recurrence_type?: string;
  recurrence_day?: number;
  default_team_size?: number;
  required_certifications?: string[];
}

export interface UpdateTemplatePayload {
  name?: string;
  name_ar?: string;
  job_type?: 'pm' | 'defect' | 'inspection';
  equipment_id?: number;
  equipment_type?: string;
  berth?: string;
  estimated_hours?: number;
  priority?: string;
  description?: string;
  recurrence_type?: string;
  recurrence_day?: number;
  default_team_size?: number;
  required_certifications?: string[];
  is_active?: boolean;
}

export interface AddDependencyPayload {
  depends_on_job_id: number;
  dependency_type?: string;
  lag_minutes?: number;
}

export interface SplitJobPayload {
  parts: Array<{ day_id: number; hours: number }>;
}

export interface AddSkillPayload {
  skill_name: string;
  skill_level?: number;
  certification_name?: string;
  certification_number?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  document_file_id?: number;
}

export interface SubmitChecklistResponsePayload {
  answer_value: string;
  notes?: string;
  photo_file_id?: number;
}

export interface AutoScheduleOptions {
  priority_weight?: number;
  balance_berths?: boolean;
  consider_skills?: boolean;
  minimize_travel?: boolean;
}

export interface SimulateScenarioPayload {
  plan_id: number;
  scenario: {
    type: 'remove_worker' | 'add_job' | 'delay';
    params: any;
  };
}

export interface CreateCapacityConfigPayload {
  name: string;
  role?: string;
  shift?: 'day' | 'night';
  max_hours_per_day?: number;
  max_jobs_per_day?: number;
  min_rest_hours?: number;
  overtime_threshold_hours?: number;
  max_overtime_hours?: number;
  break_duration_minutes?: number;
  break_after_hours?: number;
  concurrent_jobs_allowed?: number;
}

export interface UpdateCapacityConfigPayload {
  name?: string;
  role?: string;
  shift?: 'day' | 'night';
  max_hours_per_day?: number;
  max_jobs_per_day?: number;
  min_rest_hours?: number;
  overtime_threshold_hours?: number;
  max_overtime_hours?: number;
  break_duration_minutes?: number;
  break_after_hours?: number;
  concurrent_jobs_allowed?: number;
  is_active?: boolean;
}

export interface CreateEquipmentRestrictionPayload {
  equipment_id: number;
  restriction_type: 'blackout' | 'crew_size' | 'skill_required' | 'shift_only';
  value: any;
  reason?: string;
  start_date?: string;
  end_date?: string;
  is_permanent?: boolean;
}

export interface UpdateEquipmentRestrictionPayload {
  restriction_type?: 'blackout' | 'crew_size' | 'skill_required' | 'shift_only';
  value?: any;
  reason?: string;
  start_date?: string;
  end_date?: string;
  is_permanent?: boolean;
  is_active?: boolean;
}

export interface ResolveConflictPayload {
  resolution: string;
}

// ==================== API RESPONSE TYPES ====================

export interface TemplatesListResponse {
  status: string;
  templates: JobTemplate[];
  count: number;
}

export interface CapacityConfigsListResponse {
  status: string;
  configs: CapacityConfig[];
  count: number;
}

export interface WorkerSkillsListResponse {
  status: string;
  skills: WorkerSkill[];
  count: number;
}

export interface EquipmentRestrictionsListResponse {
  status: string;
  restrictions: EquipmentRestriction[];
  count: number;
}

export interface WorkPlanVersionsListResponse {
  status: string;
  versions: WorkPlanVersion[];
  count: number;
}

export interface ConflictsListResponse {
  status: string;
  conflicts: SchedulingConflict[];
  count: number;
}

export interface ChecklistResponsesListResponse {
  status: string;
  responses: JobChecklistResponse[];
  count: number;
}

export interface TeamSuggestionsResponse {
  status: string;
  suggestions: TeamSuggestion[];
}

export interface DurationPredictionResponse {
  status: string;
  prediction: JobDurationPrediction;
}

export interface DelayRiskResponse {
  status: string;
  prediction: DelayRiskPrediction;
}

export interface CompletionPredictionResponse {
  status: string;
  prediction: CompletionPrediction;
}

export interface WorkloadForecastResponse {
  status: string;
  forecast: WorkloadForecast[];
}

export interface AnomaliesResponse {
  status: string;
  anomalies: ScheduleAnomaly[];
}

export interface BottlenecksResponse {
  status: string;
  bottlenecks: SchedulingBottleneck[];
}

export interface LiveStatusResponse {
  status: string;
  summary: LiveStatusSummary;
}

export interface SkillGapsResponse {
  status: string;
  gaps: SkillGap[];
}

export interface EfficiencyScoreResponse {
  status: string;
  efficiency: EfficiencyScore;
}

export interface PlanValidationResponse {
  status: string;
  validation: PlanValidation;
}

export interface SimulationResponse {
  status: string;
  result: {
    impact: string;
    affected_jobs: number[];
    recommendations: string[];
  };
}
