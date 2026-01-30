import { getApiClient } from './client';
export const leaderboardsApi = {
    getOverall(params) {
        return getApiClient().get('/api/leaderboards', { params });
    },
    getInspectors(params) {
        return getApiClient().get('/api/leaderboards/inspectors', { params });
    },
    getSpecialists(params) {
        return getApiClient().get('/api/leaderboards/specialists', { params });
    },
    getEngineers(params) {
        return getApiClient().get('/api/leaderboards/engineers', { params });
    },
    getQualityEngineers(params) {
        return getApiClient().get('/api/leaderboards/quality-engineers', { params });
    },
};
//# sourceMappingURL=leaderboards.api.js.map