import { getApiClient } from './client';
export const ratingsApi = {
    rateInspection(inspectionId, payload) {
        return getApiClient().post(`/api/ratings/inspections/${inspectionId}`, payload);
    },
    updateRating(inspectionId, payload) {
        return getApiClient().put(`/api/ratings/inspections/${inspectionId}`, payload);
    },
    getTechnicianRatings(technicianId) {
        return getApiClient().get(`/api/ratings/technicians/${technicianId}`);
    },
};
//# sourceMappingURL=ratings.api.js.map