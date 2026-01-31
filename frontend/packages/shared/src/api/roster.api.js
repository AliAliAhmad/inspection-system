import { getApiClient } from './client';
export const rosterApi = {
    upload(file) {
        const formData = new FormData();
        formData.append('file', file);
        return getApiClient().post('/api/roster/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    getWeek(date) {
        return getApiClient().get('/api/roster/week', { params: date ? { date } : undefined });
    },
    getDayAvailability(date, shift) {
        return getApiClient().get('/api/roster/day-availability', { params: { date, ...(shift ? { shift } : {}) } });
    },
};
//# sourceMappingURL=roster.api.js.map