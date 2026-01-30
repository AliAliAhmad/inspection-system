import { getApiClient } from './client';
import { ApiResponse, BonusStar, AwardBonusPayload } from '../types';

export interface RequestBonusPayload {
  user_id: number;
  amount: number;
  reason: string;
  related_job_type?: string;
  related_job_id?: number;
}

export const bonusStarsApi = {
  list() {
    return getApiClient().get<ApiResponse<BonusStar[]>>('/api/bonus-stars');
  },

  award(payload: AwardBonusPayload) {
    return getApiClient().post<ApiResponse<BonusStar>>('/api/bonus-stars', payload);
  },

  requestBonus(payload: RequestBonusPayload) {
    return getApiClient().post<ApiResponse<BonusStar>>('/api/bonus-stars/request', payload);
  },

  approveRequest(bonusId: number) {
    return getApiClient().post<ApiResponse<BonusStar>>(`/api/bonus-stars/${bonusId}/approve`);
  },

  denyRequest(bonusId: number) {
    return getApiClient().post<ApiResponse<BonusStar>>(`/api/bonus-stars/${bonusId}/deny`);
  },
};
