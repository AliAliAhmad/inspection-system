import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Defect,
  DefectStatus,
  DefectSeverity,
} from '../types';

export interface DefectListParams extends PaginationParams {
  status?: DefectStatus;
  severity?: DefectSeverity;
}

export const defectsApi = {
  list(params?: DefectListParams) {
    return getApiClient().get<PaginatedResponse<Defect>>('/api/defects', { params });
  },

  resolve(id: number) {
    return getApiClient().post<ApiResponse<Defect>>(`/api/defects/${id}/resolve`);
  },

  close(id: number) {
    return getApiClient().post<ApiResponse<Defect>>(`/api/defects/${id}/close`);
  },
};
