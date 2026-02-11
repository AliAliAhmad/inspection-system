import { getApiClient } from './client';
import { ApiResponse } from '../types';

export type RoutineShiftType = 'morning' | 'afternoon' | 'night';
export type RoutineDayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type RoutineFrequencyType = 'daily' | 'weekly' | 'monthly';

export interface InspectionRoutine {
  id: number;
  name: string;
  name_ar: string | null;
  asset_types: string[];
  template_id: number;
  shift: RoutineShiftType | null;
  days_of_week: RoutineDayOfWeek[] | null;
  frequency: RoutineFrequencyType;
  is_active: boolean;
  created_at: string;
}

export interface CreateRoutinePayload {
  name: string;
  name_ar?: string;
  asset_types: string[];
  template_id: number;
  shift?: RoutineShiftType | null;
  days_of_week?: RoutineDayOfWeek[] | null;
  frequency?: RoutineFrequencyType;
}

export interface UploadScheduleResult {
  created: number;
  equipment_processed: number;
  errors: string[];
}

export interface EquipmentSchedule {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string | null;
  berth: string | null;
  location: string | null;
  days: Record<string, string>; // "0"-"6" -> "day"|"night"|"both"
}

export interface UpcomingEntry {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string | null;
  berth: string | null;
  shift: string;
}

export interface UpcomingData {
  today: UpcomingEntry[];
  today_date: string;
  tomorrow: UpcomingEntry[];
  tomorrow_date: string;
}

export const inspectionRoutinesApi = {
  list() {
    return getApiClient().get<ApiResponse<InspectionRoutine[]>>('/api/inspection-routines');
  },
  create(payload: CreateRoutinePayload) {
    return getApiClient().post<ApiResponse<InspectionRoutine>>('/api/inspection-routines', payload);
  },
  update(id: number, payload: Partial<CreateRoutinePayload & { is_active: boolean }>) {
    return getApiClient().put<ApiResponse<InspectionRoutine>>(`/api/inspection-routines/${id}`, payload);
  },
  delete(id: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/inspection-routines/${id}`);
  },
  uploadSchedule(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return getApiClient().post<ApiResponse<UploadScheduleResult>>(
      '/api/inspection-routines/upload-schedule',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
  getSchedules() {
    return getApiClient().get<ApiResponse<EquipmentSchedule[]>>('/api/inspection-routines/schedules');
  },
  getUpcoming() {
    return getApiClient().get<ApiResponse<UpcomingData>>('/api/inspection-routines/schedules/upcoming');
  },
  debugSchedules() {
    return getApiClient().get<ApiResponse<any>>('/api/inspection-routines/schedules/debug');
  },
  clearAllSchedules() {
    return getApiClient().delete<ApiResponse<{ deleted: number }>>('/api/inspection-routines/schedules/clear-all');
  },
};
