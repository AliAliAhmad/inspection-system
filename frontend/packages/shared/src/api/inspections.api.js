import { getApiClient } from './client';
export const inspectionsApi = {
    list(params) {
        return getApiClient().get('/api/inspections', { params });
    },
    get(id) {
        return getApiClient().get(`/api/inspections/${id}`);
    },
    getByAssignment(assignmentId) {
        return getApiClient().get(`/api/inspections/by-assignment/${assignmentId}`);
    },
    start(payload) {
        return getApiClient().post('/api/inspections/start', payload);
    },
    answerQuestion(id, payload) {
        return getApiClient().post(`/api/inspections/${id}/answer`, payload);
    },
    getProgress(id) {
        return getApiClient().get(`/api/inspections/${id}/progress`);
    },
    submit(id) {
        return getApiClient().post(`/api/inspections/${id}/submit`);
    },
    review(id, payload) {
        return getApiClient().post(`/api/inspections/${id}/review`, payload);
    },
    remove(id) {
        return getApiClient().delete(`/api/inspections/${id}`);
    },
};
//# sourceMappingURL=inspections.api.js.map