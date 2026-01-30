import { getApiClient } from './client';
export const bonusStarsApi = {
    list() {
        return getApiClient().get('/api/bonus-stars');
    },
    award(payload) {
        return getApiClient().post('/api/bonus-stars', payload);
    },
    requestBonus(payload) {
        return getApiClient().post('/api/bonus-stars/request', payload);
    },
    approveRequest(bonusId) {
        return getApiClient().post(`/api/bonus-stars/${bonusId}/approve`);
    },
    denyRequest(bonusId) {
        return getApiClient().post(`/api/bonus-stars/${bonusId}/deny`);
    },
};
//# sourceMappingURL=bonus-stars.api.js.map