import { getApiClient } from './client';
export const usersApi = {
    list(params) {
        return getApiClient().get('/api/users', { params });
    },
    create(payload) {
        return getApiClient().post('/api/users', payload);
    },
    update(userId, payload) {
        return getApiClient().put(`/api/users/${userId}`, payload);
    },
    remove(userId) {
        return getApiClient().delete(`/api/users/${userId}`);
    },
};
//# sourceMappingURL=users.api.js.map