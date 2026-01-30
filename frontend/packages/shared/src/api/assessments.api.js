import { getApiClient } from './client';
export const assessmentsApi = {
    list(params) {
        return getApiClient().get('/api/assessments', { params });
    },
    get(id) {
        return getApiClient().get(`/api/assessments/${id}`);
    },
    create(assignmentId) {
        return getApiClient().post(`/api/assessments/create/${assignmentId}`);
    },
    submitVerdict(id, payload) {
        return getApiClient().post(`/api/assessments/${id}/verdict`, payload);
    },
    adminResolve(id, payload) {
        return getApiClient().post(`/api/assessments/${id}/admin-resolve`, payload);
    },
    getPending() {
        return getApiClient().get('/api/assessments/pending');
    },
};
//# sourceMappingURL=assessments.api.js.map