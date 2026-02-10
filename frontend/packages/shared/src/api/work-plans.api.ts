import { getApiClient, getApiBaseUrl } from './client';
import { ApiResponse } from '../types';
import {
  WorkPlan,
  WorkPlanJob,
  WorkPlanAssignment,
  WorkPlanMaterial,
  MyWorkPlanResponse,
  AvailableJobsResponse,
  CreateWorkPlanPayload,
  AddJobPayload,
  UpdateJobPayload,
  AssignUserPayload,
  AddMaterialPayload,
  MoveJobPayload,
  MoveJobResponse,
  // Enhanced Work Planning Types
  JobTemplate,
  JobDependency,
  CapacityConfig,
  WorkerSkill,
  EquipmentRestriction,
  WorkPlanVersion,
  JobChecklistResponse,
  SchedulingConflict,
  // Payloads
  CreateTemplatePayload,
  UpdateTemplatePayload,
  AddDependencyPayload,
  SplitJobPayload,
  AddSkillPayload,
  SubmitChecklistResponsePayload,
  AutoScheduleOptions,
  SimulateScenarioPayload,
  CreateCapacityConfigPayload,
  UpdateCapacityConfigPayload,
  CreateEquipmentRestrictionPayload,
  UpdateEquipmentRestrictionPayload,
  ResolveConflictPayload,
  // Response Types
  TemplatesListResponse,
  CapacityConfigsListResponse,
  WorkerSkillsListResponse,
  EquipmentRestrictionsListResponse,
  WorkPlanVersionsListResponse,
  ConflictsListResponse,
  ChecklistResponsesListResponse,
  TeamSuggestionsResponse,
  DurationPredictionResponse,
  DelayRiskResponse,
  CompletionPredictionResponse,
  WorkloadForecastResponse,
  AnomaliesResponse,
  BottlenecksResponse,
  LiveStatusResponse,
  SkillGapsResponse,
  EfficiencyScoreResponse,
  PlanValidationResponse,
  SimulationResponse,
} from '../types/work-plan.types';

export interface WorkPlanListParams {
  week_start?: string;
  status?: 'draft' | 'published';
  include_days?: boolean;
}

export interface WorkPlansListResponse {
  status: string;
  work_plans: WorkPlan[];
  count: number;
}

export interface SAPImportResponse {
  status: string;
  message: string;
  created: number;
  templates_linked: number;
  materials_added: number;
  errors: string[];
}

export const workPlansApi = {
  // Work Plans
  list(params?: WorkPlanListParams) {
    return getApiClient().get<WorkPlansListResponse>('/api/work-plans', { params });
  },

  get(planId: number) {
    return getApiClient().get<ApiResponse<WorkPlan>>('/api/work-plans/' + planId);
  },

  create(payload: CreateWorkPlanPayload) {
    return getApiClient().post<ApiResponse<WorkPlan>>('/api/work-plans', payload);
  },

  update(planId: number, payload: { notes?: string }) {
    return getApiClient().put<ApiResponse<WorkPlan>>('/api/work-plans/' + planId, payload);
  },

  delete(planId: number) {
    return getApiClient().delete<ApiResponse<void>>('/api/work-plans/' + planId);
  },

  publish(planId: number) {
    return getApiClient().post<ApiResponse<WorkPlan>>(`/api/work-plans/${planId}/publish`);
  },

  // Jobs
  addJob(planId: number, payload: AddJobPayload) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs`, payload);
  },

  updateJob(planId: number, jobId: number, payload: UpdateJobPayload) {
    return getApiClient().put<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/${jobId}`, payload);
  },

  removeJob(planId: number, jobId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/${planId}/jobs/${jobId}`);
  },

  /**
   * Move a job to a different day (for drag & drop)
   */
  moveJob(planId: number, jobId: number, payload: MoveJobPayload) {
    return getApiClient().post<ApiResponse<MoveJobResponse>>(
      `/api/work-plans/${planId}/jobs/${jobId}/move`,
      payload
    );
  },

  // Assignments
  assignUser(planId: number, jobId: number, payload: AssignUserPayload) {
    return getApiClient().post<ApiResponse<WorkPlanAssignment>>(
      `/api/work-plans/${planId}/jobs/${jobId}/assignments`,
      payload
    );
  },

  unassignUser(planId: number, jobId: number, assignmentId: number) {
    return getApiClient().delete<ApiResponse<void>>(
      `/api/work-plans/${planId}/jobs/${jobId}/assignments/${assignmentId}`
    );
  },

  // Materials
  addMaterial(planId: number, jobId: number, payload: AddMaterialPayload) {
    return getApiClient().post<ApiResponse<WorkPlanMaterial[]>>(
      `/api/work-plans/${planId}/jobs/${jobId}/materials`,
      payload
    );
  },

  removeMaterial(planId: number, jobId: number, materialId: number) {
    return getApiClient().delete<ApiResponse<void>>(
      `/api/work-plans/${planId}/jobs/${jobId}/materials/${materialId}`
    );
  },

  // My Plan
  getMyPlan(weekStart?: string) {
    const params = weekStart ? { week_start: weekStart } : undefined;
    return getApiClient().get<MyWorkPlanResponse & { status: string }>('/api/work-plans/my-plan', { params });
  },

  // Available Jobs (includes SAP orders from pool)
  getAvailableJobs(params?: { berth?: string; job_type?: string; plan_id?: number }) {
    return getApiClient().get<AvailableJobsResponse & { status: string }>('/api/work-plans/available-jobs', { params });
  },

  // Schedule SAP order from pool to a day
  scheduleSAPOrder(planId: number, payload: { sap_order_id: number; day_id: number; position?: number }) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(
      `/api/work-plans/${planId}/schedule-sap-order`,
      payload
    );
  },

  // SAP Import
  importSAP(planId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return getApiClient().post<SAPImportResponse>(
      `/api/work-plans/import-sap?plan_id=${planId}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },

  // Templates
  getSAPImportTemplateUrl() {
    return `${getApiBaseUrl()}/api/work-plans/templates/sap-import`;
  },

  getMaterialsTemplateUrl() {
    return `${getApiBaseUrl()}/api/work-plans/templates/materials`;
  },

  // Day PDF
  getDayPdf(planId: number, dayDate: string) {
    return getApiClient().get<ApiResponse<{ pdf_url: string }>>(`/api/work-plans/${planId}/pdf/day/${dayDate}`);
  },

  // Clear SAP orders from pool
  clearPool(weekStart: string) {
    return getApiClient().post<{ status: string; deleted: number }>(`/api/work-plans/clear-pool/${weekStart}`);
  },

  // Auto-schedule jobs from pool to calendar
  autoSchedule(planId: number, options?: { include_weekends?: boolean; max_hours_per_day?: number; berth?: string }) {
    return getApiClient().post<{
      status: string;
      message: string;
      scheduled: number;
      skipped: number;
      total_in_pool: number;
    }>(`/api/work-plans/${planId}/auto-schedule`, options);
  },

  // Copy jobs from a previous week
  copyFromWeek(planId: number, sourceWeekStart: string) {
    return getApiClient().post<{
      status: string;
      message: string;
      copied: number;
      skipped: number;
      source_week: string;
    }>(`/api/work-plans/${planId}/copy-from-week`, { source_week_start: sourceWeekStart });
  },

  // ==================== JOB TEMPLATES ====================

  listTemplates(params?: { job_type?: string; equipment_type?: string; is_active?: boolean }) {
    return getApiClient().get<TemplatesListResponse>('/api/work-plans/templates', { params });
  },

  getTemplate(templateId: number) {
    return getApiClient().get<ApiResponse<JobTemplate>>(`/api/work-plans/templates/${templateId}`);
  },

  createTemplate(payload: CreateTemplatePayload) {
    return getApiClient().post<ApiResponse<JobTemplate>>('/api/work-plans/templates', payload);
  },

  updateTemplate(templateId: number, payload: UpdateTemplatePayload) {
    return getApiClient().put<ApiResponse<JobTemplate>>(`/api/work-plans/templates/${templateId}`, payload);
  },

  deleteTemplate(templateId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/templates/${templateId}`);
  },

  cloneTemplate(templateId: number, payload: { new_name: string }) {
    return getApiClient().post<ApiResponse<JobTemplate>>(`/api/work-plans/templates/${templateId}/clone`, payload);
  },

  // Template Materials
  addTemplateMaterial(templateId: number, payload: { material_id: number; quantity: number; is_optional?: boolean }) {
    return getApiClient().post<ApiResponse<JobTemplate>>(`/api/work-plans/templates/${templateId}/materials`, payload);
  },

  removeTemplateMaterial(templateId: number, materialId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/templates/${templateId}/materials/${materialId}`);
  },

  // Template Checklist Items
  addTemplateChecklistItem(templateId: number, payload: {
    question: string;
    question_ar?: string;
    answer_type?: string;
    is_required?: boolean;
    order_index?: number;
    fail_action?: string;
  }) {
    return getApiClient().post<ApiResponse<JobTemplate>>(`/api/work-plans/templates/${templateId}/checklist`, payload);
  },

  updateTemplateChecklistItem(templateId: number, itemId: number, payload: {
    question?: string;
    question_ar?: string;
    answer_type?: string;
    is_required?: boolean;
    order_index?: number;
    fail_action?: string;
  }) {
    return getApiClient().put<ApiResponse<JobTemplate>>(`/api/work-plans/templates/${templateId}/checklist/${itemId}`, payload);
  },

  removeTemplateChecklistItem(templateId: number, itemId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/templates/${templateId}/checklist/${itemId}`);
  },

  // Create job from template
  createJobFromTemplate(planId: number, payload: { template_id: number; day_id: number; equipment_id?: number }) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/from-template`, payload);
  },

  // ==================== JOB DEPENDENCIES ====================

  listJobDependencies(planId: number, jobId: number) {
    return getApiClient().get<{ status: string; dependencies: JobDependency[] }>(`/api/work-plans/${planId}/jobs/${jobId}/dependencies`);
  },

  addJobDependency(planId: number, jobId: number, payload: AddDependencyPayload) {
    return getApiClient().post<ApiResponse<JobDependency>>(`/api/work-plans/${planId}/jobs/${jobId}/dependencies`, payload);
  },

  removeJobDependency(planId: number, jobId: number, dependencyId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/${planId}/jobs/${jobId}/dependencies/${dependencyId}`);
  },

  // ==================== JOB SPLITTING ====================

  splitJob(planId: number, jobId: number, payload: SplitJobPayload) {
    return getApiClient().post<ApiResponse<WorkPlanJob[]>>(`/api/work-plans/${planId}/jobs/${jobId}/split`, payload);
  },

  mergeSplitJobs(planId: number, jobId: number, payload: { merge_job_ids: number[] }) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/${jobId}/merge`, payload);
  },

  // ==================== CAPACITY CONFIGURATION ====================

  listCapacityConfigs(params?: { role?: string; shift?: string; is_active?: boolean }) {
    return getApiClient().get<CapacityConfigsListResponse>('/api/work-plans/capacity-configs', { params });
  },

  getCapacityConfig(configId: number) {
    return getApiClient().get<ApiResponse<CapacityConfig>>(`/api/work-plans/capacity-configs/${configId}`);
  },

  createCapacityConfig(payload: CreateCapacityConfigPayload) {
    return getApiClient().post<ApiResponse<CapacityConfig>>('/api/work-plans/capacity-configs', payload);
  },

  updateCapacityConfig(configId: number, payload: UpdateCapacityConfigPayload) {
    return getApiClient().put<ApiResponse<CapacityConfig>>(`/api/work-plans/capacity-configs/${configId}`, payload);
  },

  deleteCapacityConfig(configId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/capacity-configs/${configId}`);
  },

  // ==================== WORKER SKILLS ====================

  listWorkerSkills(params?: { user_id?: number; skill_name?: string; is_verified?: boolean; expiring_soon?: boolean }) {
    return getApiClient().get<WorkerSkillsListResponse>('/api/work-plans/worker-skills', { params });
  },

  getWorkerSkill(skillId: number) {
    return getApiClient().get<ApiResponse<WorkerSkill>>(`/api/work-plans/worker-skills/${skillId}`);
  },

  addWorkerSkill(userId: number, payload: AddSkillPayload) {
    return getApiClient().post<ApiResponse<WorkerSkill>>(`/api/work-plans/workers/${userId}/skills`, payload);
  },

  createWorkerSkill(payload: AddSkillPayload & { user_id: number }) {
    return getApiClient().post<ApiResponse<WorkerSkill>>(`/api/work-plans/workers/${payload.user_id}/skills`, payload);
  },

  updateWorkerSkill(skillId: number, payload: Partial<AddSkillPayload> & { is_verified?: boolean }) {
    return getApiClient().put<ApiResponse<WorkerSkill>>(`/api/work-plans/worker-skills/${skillId}`, payload);
  },

  deleteWorkerSkill(skillId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/worker-skills/${skillId}`);
  },

  verifyWorkerSkill(skillId: number) {
    return getApiClient().post<ApiResponse<WorkerSkill>>(`/api/work-plans/worker-skills/${skillId}/verify`);
  },

  getWorkerSkillsByUser(userId: number) {
    return getApiClient().get<WorkerSkillsListResponse>(`/api/work-plans/workers/${userId}/skills`);
  },

  // ==================== EQUIPMENT RESTRICTIONS ====================

  listEquipmentRestrictions(params?: { equipment_id?: number; restriction_type?: string; is_active?: boolean }) {
    return getApiClient().get<EquipmentRestrictionsListResponse>('/api/work-plans/equipment-restrictions', { params });
  },

  getEquipmentRestriction(restrictionId: number) {
    return getApiClient().get<ApiResponse<EquipmentRestriction>>(`/api/work-plans/equipment-restrictions/${restrictionId}`);
  },

  createEquipmentRestriction(payload: CreateEquipmentRestrictionPayload) {
    return getApiClient().post<ApiResponse<EquipmentRestriction>>('/api/work-plans/equipment-restrictions', payload);
  },

  updateEquipmentRestriction(restrictionId: number, payload: UpdateEquipmentRestrictionPayload) {
    return getApiClient().put<ApiResponse<EquipmentRestriction>>(`/api/work-plans/equipment-restrictions/${restrictionId}`, payload);
  },

  deleteEquipmentRestriction(restrictionId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/work-plans/equipment-restrictions/${restrictionId}`);
  },

  getEquipmentRestrictionsByEquipment(equipmentId: number) {
    return getApiClient().get<EquipmentRestrictionsListResponse>(`/api/work-plans/equipment/${equipmentId}/restrictions`);
  },

  // ==================== WORK PLAN VERSIONS ====================

  listPlanVersions(planId: number) {
    return getApiClient().get<WorkPlanVersionsListResponse>(`/api/work-plans/${planId}/versions`);
  },

  getPlanVersion(planId: number, versionId: number) {
    return getApiClient().get<ApiResponse<WorkPlanVersion>>(`/api/work-plans/${planId}/versions/${versionId}`);
  },

  restorePlanVersion(planId: number, versionId: number) {
    return getApiClient().post<ApiResponse<WorkPlan>>(`/api/work-plans/${planId}/versions/${versionId}/restore`);
  },

  comparePlanVersions(planId: number, version1Id: number, version2Id: number) {
    return getApiClient().get<ApiResponse<{ changes: any[] }>>(`/api/work-plans/${planId}/versions/compare`, {
      params: { version1: version1Id, version2: version2Id }
    });
  },

  // ==================== JOB CHECKLISTS ====================

  getJobChecklist(planId: number, jobId: number) {
    return getApiClient().get<ChecklistResponsesListResponse>(`/api/work-plans/${planId}/jobs/${jobId}/checklist`);
  },

  submitChecklistResponse(planId: number, jobId: number, itemId: number, payload: SubmitChecklistResponsePayload) {
    return getApiClient().post<ApiResponse<JobChecklistResponse>>(`/api/work-plans/${planId}/jobs/${jobId}/checklist/${itemId}`, payload);
  },

  updateChecklistResponse(planId: number, jobId: number, responseId: number, payload: Partial<SubmitChecklistResponsePayload>) {
    return getApiClient().put<ApiResponse<JobChecklistResponse>>(`/api/work-plans/${planId}/jobs/${jobId}/checklist/${responseId}`, payload);
  },

  completeJobChecklist(planId: number, jobId: number) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/${jobId}/checklist/complete`);
  },

  // ==================== SCHEDULING CONFLICTS ====================

  listConflicts(planId: number, params?: { conflict_type?: string; severity?: string; is_resolved?: boolean }) {
    return getApiClient().get<ConflictsListResponse>(`/api/work-plans/${planId}/conflicts`, { params });
  },

  getConflict(planId: number, conflictId: number) {
    return getApiClient().get<ApiResponse<SchedulingConflict>>(`/api/work-plans/${planId}/conflicts/${conflictId}`);
  },

  resolveConflict(planId: number, conflictId: number, payload: ResolveConflictPayload) {
    return getApiClient().post<ApiResponse<SchedulingConflict>>(`/api/work-plans/${planId}/conflicts/${conflictId}/resolve`, payload);
  },

  ignoreConflict(planId: number, conflictId: number) {
    return getApiClient().post<ApiResponse<SchedulingConflict>>(`/api/work-plans/${planId}/conflicts/${conflictId}/ignore`);
  },

  detectConflicts(planId: number) {
    return getApiClient().post<ConflictsListResponse>(`/api/work-plans/${planId}/conflicts/detect`);
  },

  // ==================== AI / PREDICTION ENDPOINTS ====================

  // Team Suggestions
  getTeamSuggestions(planId: number, jobId: number) {
    return getApiClient().get<TeamSuggestionsResponse>(`/api/work-plans/${planId}/jobs/${jobId}/suggest-team`);
  },

  // Duration Prediction
  predictJobDuration(planId: number, jobId: number) {
    return getApiClient().get<DurationPredictionResponse>(`/api/work-plans/${planId}/jobs/${jobId}/predict-duration`);
  },

  // Delay Risk
  predictDelayRisk(planId: number, jobId: number) {
    return getApiClient().get<DelayRiskResponse>(`/api/work-plans/${planId}/jobs/${jobId}/delay-risk`);
  },

  // Completion Prediction
  predictCompletion(planId: number) {
    return getApiClient().get<CompletionPredictionResponse>(`/api/work-plans/${planId}/predict-completion`);
  },

  // Workload Forecast
  forecastWorkload(params?: { weeks_ahead?: number }) {
    return getApiClient().get<WorkloadForecastResponse>('/api/work-plans/forecast-workload', { params });
  },

  // Anomaly Detection
  detectAnomalies(planId: number) {
    return getApiClient().get<AnomaliesResponse>(`/api/work-plans/${planId}/detect-anomalies`);
  },

  // Bottleneck Analysis
  analyzeBottlenecks(planId: number) {
    return getApiClient().get<BottlenecksResponse>(`/api/work-plans/${planId}/bottlenecks`);
  },

  // Live Status Summary
  getLiveStatus(planId: number) {
    return getApiClient().get<LiveStatusResponse>(`/api/work-plans/${planId}/live-status`);
  },

  // Skill Gap Analysis
  analyzeSkillGaps(params?: { date_range_start?: string; date_range_end?: string }) {
    return getApiClient().get<SkillGapsResponse>('/api/work-plans/skill-gaps', { params });
  },

  // Efficiency Score
  getEfficiencyScore(planId: number) {
    return getApiClient().get<EfficiencyScoreResponse>(`/api/work-plans/${planId}/efficiency-score`);
  },

  // Plan Validation
  validatePlan(planId: number) {
    return getApiClient().get<PlanValidationResponse>(`/api/work-plans/${planId}/validate`);
  },

  // Scenario Simulation
  simulateScenario(payload: SimulateScenarioPayload) {
    return getApiClient().post<SimulationResponse>('/api/work-plans/simulate', payload);
  },

  // ==================== ENHANCED AUTO-SCHEDULING ====================

  autoScheduleEnhanced(planId: number, options?: AutoScheduleOptions) {
    return getApiClient().post<{
      status: string;
      message: string;
      scheduled: number;
      skipped: number;
      conflicts: SchedulingConflict[];
    }>(`/api/work-plans/${planId}/auto-schedule-enhanced`, options);
  },

  // ==================== JOB TIME TRACKING ====================

  startJob(planId: number, jobId: number) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/${jobId}/start`);
  },

  completeJob(planId: number, jobId: number, payload?: { notes?: string; photo_file_id?: number }) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/${jobId}/complete`, payload);
  },

  pauseJob(planId: number, jobId: number, payload?: { reason?: string }) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/${jobId}/pause`, payload);
  },

  resumeJob(planId: number, jobId: number) {
    return getApiClient().post<ApiResponse<WorkPlanJob>>(`/api/work-plans/${planId}/jobs/${jobId}/resume`);
  },

  // ==================== BULK OPERATIONS ====================

  bulkAssignUsers(planId: number, payload: { job_ids: number[]; user_ids: number[] }) {
    return getApiClient().post<ApiResponse<{ updated: number }>>(`/api/work-plans/${planId}/jobs/bulk-assign`, payload);
  },

  bulkMoveJobs(planId: number, payload: { job_ids: number[]; target_day_id: number }) {
    return getApiClient().post<ApiResponse<{ moved: number }>>(`/api/work-plans/${planId}/jobs/bulk-move`, payload);
  },

  bulkUpdatePriority(planId: number, payload: { job_ids: number[]; priority: string }) {
    return getApiClient().post<ApiResponse<{ updated: number }>>(`/api/work-plans/${planId}/jobs/bulk-priority`, payload);
  },

  bulkDeleteJobs(planId: number, payload: { job_ids: number[] }) {
    return getApiClient().post<ApiResponse<{ deleted: number }>>(`/api/work-plans/${planId}/jobs/bulk-delete`, payload);
  },

  // ==================== REPORTS & EXPORTS ====================

  exportPlanToExcel(planId: number) {
    return getApiClient().get<Blob>(`/api/work-plans/${planId}/export/excel`, { responseType: 'blob' });
  },

  getResourceUtilizationReport(planId: number) {
    return getApiClient().get<ApiResponse<{
      by_worker: Array<{ user_id: number; name: string; hours: number; jobs: number; utilization: number }>;
      by_equipment: Array<{ equipment_id: number; name: string; hours: number; jobs: number }>;
      by_day: Array<{ date: string; total_hours: number; total_jobs: number }>;
    }>>(`/api/work-plans/${planId}/reports/resource-utilization`);
  },

  getHistoricalAnalysis(params?: { from_date?: string; to_date?: string; group_by?: string }) {
    return getApiClient().get<ApiResponse<{
      completion_rates: Array<{ period: string; rate: number }>;
      average_duration: Array<{ job_type: string; avg_hours: number }>;
      delay_frequency: Array<{ reason: string; count: number }>;
    }>>('/api/work-plans/reports/historical-analysis', { params });
  },
};
