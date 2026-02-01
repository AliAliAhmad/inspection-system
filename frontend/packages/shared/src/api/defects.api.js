import { getApiClient } from './client';
export const defectsApi = {
    list(params) {
        return getApiClient().get('/api/defects', { params });
    },
    resolve(id) {
        return getApiClient().post(`/api/defects/${id}/resolve`);
    },
    close(id) {
        return getApiClient().post(`/api/defects/${id}/close`);
    },
    assignSpecialist(id, payload) {
        return getApiClient().post(`/api/defects/${id}/assign-specialist`, payload);
    },
};
//# sourceMappingURL=defects.api.js.map