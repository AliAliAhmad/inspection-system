import { getApiClient } from './client';
export const inspectionRoutinesApi = {
    list() {
        return getApiClient().get('/api/inspection-routines');
    },
    create(payload) {
        return getApiClient().post('/api/inspection-routines', payload);
    },
    update(id, payload) {
        return getApiClient().put(`/api/inspection-routines/${id}`, payload);
    },
    delete(id) {
        return getApiClient().delete(`/api/inspection-routines/${id}`);
    },
};
//# sourceMappingURL=inspection-routines.api.js.map