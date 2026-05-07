import { getApiClient } from './client';
import type { ApiResponse } from '../types';
import type {
  SuspiciousReadingsResponse,
  BulkCorrectPayload,
  BulkCorrectResponse,
} from '../types/data-cleanup.types';

export const dataCleanupApi = {
  /** List inspector-typed running-hours answers that look like 10x typos. */
  listSuspiciousReadings(params?: { include_low?: boolean }) {
    return getApiClient().get<ApiResponse<SuspiciousReadingsResponse>>(
      '/api/admin/cleanup/suspicious-readings',
      { params }
    );
  },

  /** Apply admin-approved corrections in one batch. */
  bulkCorrectReadings(payload: BulkCorrectPayload) {
    return getApiClient().post<ApiResponse<BulkCorrectResponse>>(
      '/api/admin/cleanup/bulk-correct-readings',
      payload
    );
  },
};
