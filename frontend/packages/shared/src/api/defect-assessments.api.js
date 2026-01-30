import { getApiClient } from './client';
export const defectAssessmentsApi = {
    list() {
        return getApiClient().get('/api/defect-assessments');
    },
    getPending() {
        return getApiClient().get('/api/defect-assessments/pending');
    },
    create(payload) {
        return getApiClient().post('/api/defect-assessments', payload);
    },
};
//# sourceMappingURL=defect-assessments.api.js.map