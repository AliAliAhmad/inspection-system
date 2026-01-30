import { getApiClient } from './client';
export const filesApi = {
    upload(file, relatedType, relatedId, category) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('related_type', relatedType);
        formData.append('related_id', String(relatedId));
        if (category) {
            formData.append('category', category);
        }
        return getApiClient().post('/api/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    uploadMultiple(files, relatedType, relatedId, category) {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        formData.append('related_type', relatedType);
        formData.append('related_id', String(relatedId));
        if (category) {
            formData.append('category', category);
        }
        return getApiClient().post('/api/files/upload-multiple', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    download(fileId) {
        return getApiClient().get(`/api/files/${fileId}/download`, {
            responseType: 'blob',
        });
    },
    list(params) {
        return getApiClient().get('/api/files', { params });
    },
    remove(fileId) {
        return getApiClient().delete(`/api/files/${fileId}`);
    },
};
//# sourceMappingURL=files.api.js.map