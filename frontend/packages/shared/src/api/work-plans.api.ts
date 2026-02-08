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
};
