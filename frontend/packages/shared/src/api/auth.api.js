import { getApiClient } from './client';
export const authApi = {
    login(credentials) {
        return getApiClient().post('/api/auth/login', credentials);
    },
    refresh() {
        return getApiClient().post('/api/auth/refresh');
    },
    getProfile() {
        return getApiClient().get('/api/auth/me');
    },
    logout() {
        return getApiClient().post('/api/auth/logout');
    },
};
//# sourceMappingURL=auth.api.js.map