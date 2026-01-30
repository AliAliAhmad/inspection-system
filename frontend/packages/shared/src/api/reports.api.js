import { getApiClient } from './client';
export const reportsApi = {
    getDashboard() {
        return getApiClient().get('/api/reports/dashboard');
    },
    getAdminDashboard() {
        return getApiClient().get('/api/reports/admin-dashboard');
    },
    getPauseAnalytics() {
        return getApiClient().get('/api/reports/pause-analytics');
    },
    getDefectAnalytics() {
        return getApiClient().get('/api/reports/defect-analytics');
    },
    getCapacity() {
        return getApiClient().get('/api/reports/capacity');
    },
};
//# sourceMappingURL=reports.api.js.map