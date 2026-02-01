import { getApiClient } from './client';
export const specialistJobsApi = {
    list(params) {
        return getApiClient().get('/api/jobs', { params });
    },
    get(jobId) {
        return getApiClient().get(`/api/jobs/${jobId}`);
    },
    enterPlannedTime(jobId, hours) {
        return getApiClient().post(`/api/jobs/${jobId}/planned-time`, { planned_time_hours: hours });
    },
    start(jobId, plannedTimeHours) {
        return getApiClient().post(`/api/jobs/${jobId}/start`, plannedTimeHours ? { planned_time_hours: plannedTimeHours } : {});
    },
    wrongFinding(jobId, reason, photoPath) {
        return getApiClient().post(`/api/jobs/${jobId}/wrong-finding`, { reason, photo_path: photoPath });
    },
    complete(jobId, payload) {
        return getApiClient().post(`/api/jobs/${jobId}/complete`, payload);
    },
    markIncomplete(jobId, reason) {
        return getApiClient().post(`/api/jobs/${jobId}/incomplete`, { reason });
    },
    requestPause(jobId, payload) {
        return getApiClient().post(`/api/jobs/${jobId}/pause`, payload);
    },
    getPauseHistory(jobId) {
        return getApiClient().get(`/api/jobs/${jobId}/pause-history`);
    },
    uploadCleaning(jobId) {
        return getApiClient().post(`/api/jobs/${jobId}/cleaning`);
    },
    adminForcePause(jobId, reason) {
        return getApiClient().post(`/api/jobs/${jobId}/admin/force-pause`, { reason });
    },
    adminCleaningRating(jobId, rating) {
        return getApiClient().post(`/api/jobs/${jobId}/admin/cleaning-rating`, { rating });
    },
    adminBonus(jobId, bonus) {
        return getApiClient().post(`/api/jobs/${jobId}/admin/bonus`, { bonus });
    },
    getPendingPauses() {
        return getApiClient().get('/api/jobs/pauses/pending');
    },
    approvePause(pauseId) {
        return getApiClient().post(`/api/jobs/pauses/${pauseId}/approve`);
    },
    denyPause(pauseId) {
        return getApiClient().post(`/api/jobs/pauses/${pauseId}/deny`);
    },
    resumeJob(pauseId) {
        return getApiClient().post(`/api/jobs/pauses/${pauseId}/resume`);
    },
    getStalledJobs() {
        return getApiClient().get('/api/jobs/stalled');
    },
    requestTakeover(jobId, reason) {
        return getApiClient().post(`/api/jobs/${jobId}/takeover`, { reason });
    },
    getPendingPlannedTime() {
        return getApiClient().get('/api/jobs/pending-planned-time');
    },
    getActiveJobs() {
        return getApiClient().get('/api/jobs/active');
    },
};
//# sourceMappingURL=specialist-jobs.api.js.map