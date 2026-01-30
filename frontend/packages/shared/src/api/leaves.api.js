import { getApiClient } from './client';
export const leavesApi = {
    list(params) {
        return getApiClient().get('/api/leaves', { params });
    },
    request(payload) {
        return getApiClient().post('/api/leaves', payload);
    },
    approve(leaveId, payload) {
        return getApiClient().post(`/api/leaves/${leaveId}/approve`, payload);
    },
    reject(leaveId, payload) {
        return getApiClient().post(`/api/leaves/${leaveId}/reject`, payload);
    },
    getActive() {
        return getApiClient().get('/api/leaves/active');
    },
    getCoverageCandidates(leaveId) {
        return getApiClient().get(`/api/leaves/${leaveId}/coverage/candidates`);
    },
    assignCoverage(leaveId, userId) {
        return getApiClient().post(`/api/leaves/${leaveId}/coverage/assign`, { user_id: userId });
    },
    getCapacity(shift) {
        return getApiClient().get('/api/leaves/capacity', { params: shift ? { shift } : undefined });
    },
};
//# sourceMappingURL=leaves.api.js.map