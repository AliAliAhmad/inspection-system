import { getApiClient } from './client';
export const notificationsApi = {
    list(params) {
        return getApiClient().get('/api/notifications', { params });
    },
    markRead(id) {
        return getApiClient().post(`/api/notifications/${id}/read`);
    },
    markAllRead() {
        return getApiClient().post('/api/notifications/read-all');
    },
    remove(id) {
        return getApiClient().delete(`/api/notifications/${id}`);
    },
};
//# sourceMappingURL=notifications.api.js.map