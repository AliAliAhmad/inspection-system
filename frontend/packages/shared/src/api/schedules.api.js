import { getApiClient } from './client';
export const schedulesApi = {
    getToday() {
        return getApiClient().get('/api/schedules/today');
    },
    getWeekly() {
        return getApiClient().get('/api/schedules/weekly');
    },
    create(payload) {
        return getApiClient().post('/api/schedules', payload);
    },
    remove(id) {
        return getApiClient().delete(`/api/schedules/${id}`);
    },
};
//# sourceMappingURL=schedules.api.js.map