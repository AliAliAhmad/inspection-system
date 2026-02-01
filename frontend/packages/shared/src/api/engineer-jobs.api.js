import { getApiClient } from './client';
export const engineerJobsApi = {
    list(params) {
        return getApiClient().get('/api/engineer-jobs', { params });
    },
    get(jobId) {
        return getApiClient().get(`/api/engineer-jobs/${jobId}`);
    },
    create(payload) {
        return getApiClient().post('/api/engineer-jobs', payload);
    },
    enterPlannedTime(jobId, payload) {
        return getApiClient().post(`/api/engineer-jobs/${jobId}/planned-time`, payload);
    },
    start(jobId) {
        return getApiClient().post(`/api/engineer-jobs/${jobId}/start`);
    },
    complete(jobId, payload) {
        return getApiClient().post(`/api/engineer-jobs/${jobId}/complete`, payload);
    },
    requestPause(jobId, payload) {
        return getApiClient().post(`/api/engineer-jobs/${jobId}/pause`, payload);
    },
    getPauseHistory(jobId) {
        return getApiClient().get(`/api/engineer-jobs/${jobId}/pause-history`);
    },
};
//# sourceMappingURL=engineer-jobs.api.js.map