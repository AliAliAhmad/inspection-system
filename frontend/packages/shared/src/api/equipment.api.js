import { getApiClient } from './client';
export const equipmentApi = {
    list(params) {
        return getApiClient().get('/api/equipment', { params });
    },
    get(id) {
        return getApiClient().get(`/api/equipment/${id}`);
    },
    create(payload) {
        return getApiClient().post('/api/equipment', payload);
    },
    update(id, payload) {
        return getApiClient().put(`/api/equipment/${id}`, payload);
    },
    remove(id) {
        return getApiClient().delete(`/api/equipment/${id}`);
    },
    getTypes() {
        return getApiClient().get('/api/equipment/types');
    },
};
//# sourceMappingURL=equipment.api.js.map