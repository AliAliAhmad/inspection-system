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
    uploadSchedule(file) {
        const formData = new FormData();
        formData.append('file', file);
        return getApiClient().post('/api/inspection-routines/upload-schedule', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    getSchedules() {
        return getApiClient().get('/api/inspection-routines/schedules');
    },
    getUpcoming() {
        return getApiClient().get('/api/inspection-routines/schedules/upcoming');
    },
};
//# sourceMappingURL=inspection-routines.api.js.map