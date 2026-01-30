import { getApiClient } from './client';
export const checklistsApi = {
    listTemplates(params) {
        return getApiClient().get('/api/checklists', { params });
    },
    createTemplate(payload) {
        return getApiClient().post('/api/checklists', payload);
    },
    addItem(templateId, payload) {
        return getApiClient().post(`/api/checklists/${templateId}/items`, payload);
    },
    updateItem(templateId, itemId, payload) {
        return getApiClient().put(`/api/checklists/${templateId}/items/${itemId}`, payload);
    },
    deleteItem(templateId, itemId) {
        return getApiClient().delete(`/api/checklists/${templateId}/items/${itemId}`);
    },
};
//# sourceMappingURL=checklists.api.js.map