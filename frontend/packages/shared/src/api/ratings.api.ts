import { getApiClient } from './client';
import { ApiResponse, InspectionRating } from '../types';

export interface RateInspectionPayload {
  rating: number;
  comment?: string;
}

export const ratingsApi = {
  rateInspection(inspectionId: number, payload: RateInspectionPayload) {
    return getApiClient().post<ApiResponse<InspectionRating>>(
      `/api/ratings/inspections/${inspectionId}`,
      payload,
    );
  },

  updateRating(inspectionId: number, payload: RateInspectionPayload) {
    return getApiClient().put<ApiResponse<InspectionRating>>(
      `/api/ratings/inspections/${inspectionId}`,
      payload,
    );
  },

  getTechnicianRatings(technicianId: number) {
    return getApiClient().get<ApiResponse<InspectionRating[]>>(
      `/api/ratings/technicians/${technicianId}`,
    );
  },
};
