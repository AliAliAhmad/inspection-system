import { getApiClient } from './client';
export const qualityReviewsApi = {
    list(params) {
        return getApiClient().get('/api/quality-reviews', { params });
    },
    get(reviewId) {
        return getApiClient().get(`/api/quality-reviews/${reviewId}`);
    },
    getPending() {
        return getApiClient().get('/api/quality-reviews/pending');
    },
    getOverdue() {
        return getApiClient().get('/api/quality-reviews/overdue');
    },
    approve(reviewId, payload) {
        return getApiClient().post(`/api/quality-reviews/${reviewId}/approve`, payload);
    },
    reject(reviewId, payload) {
        return getApiClient().post(`/api/quality-reviews/${reviewId}/reject`, payload);
    },
    validate(reviewId, payload) {
        return getApiClient().post(`/api/quality-reviews/${reviewId}/validate`, payload);
    },
};
//# sourceMappingURL=quality-reviews.api.js.map