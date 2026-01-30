import { getApiClient } from './client';
export const inspectionAssignmentsApi = {
    getLists(params) {
        return getApiClient().get('/api/inspection-assignments/lists', { params });
    },
    generateList(payload) {
        return getApiClient().post('/api/inspection-assignments/lists/generate', payload);
    },
    getList(listId) {
        return getApiClient().get(`/api/inspection-assignments/lists/${listId}`);
    },
    assignTeam(assignmentId, payload) {
        return getApiClient().post(`/api/inspection-assignments/${assignmentId}/assign`, payload);
    },
    updateBerth(assignmentId, berth) {
        return getApiClient().put(`/api/inspection-assignments/${assignmentId}/berth`, { berth });
    },
    getMyAssignments(params) {
        return getApiClient().get('/api/inspection-assignments/my-assignments', { params });
    },
    completeAssignment(assignmentId) {
        return getApiClient().post(`/api/inspection-assignments/${assignmentId}/complete`);
    },
    getBacklog() {
        return getApiClient().get('/api/inspection-assignments/backlog');
    },
};
//# sourceMappingURL=inspection-assignments.api.js.map