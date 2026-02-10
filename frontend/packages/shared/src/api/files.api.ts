import { getApiClient } from './client';
import { ApiResponse, PaginatedResponse, PaginationParams, FileRecord } from '../types';

export interface FileListParams extends PaginationParams {
  related_type?: string;
  related_id?: number;
}

export const filesApi = {
  upload(file: File, relatedType: string, relatedId: number, category?: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('related_type', relatedType);
    formData.append('related_id', String(relatedId));
    if (category) {
      formData.append('category', category);
    }
    return getApiClient().post<ApiResponse<FileRecord>>('/api/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  uploadMultiple(files: File[], relatedType: string, relatedId: number, category?: string) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('related_type', relatedType);
    formData.append('related_id', String(relatedId));
    if (category) {
      formData.append('category', category);
    }
    return getApiClient().post<ApiResponse<FileRecord[]>>('/api/files/upload-multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // For React Native where FormData is pre-created with file object
  uploadFormData(formData: FormData) {
    return getApiClient().post<ApiResponse<FileRecord>>('/api/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  download(fileId: number) {
    return getApiClient().get<Blob>(`/api/files/${fileId}/download`, {
      responseType: 'blob',
    });
  },

  list(params?: FileListParams) {
    return getApiClient().get<PaginatedResponse<FileRecord>>('/api/files', { params });
  },

  remove(fileId: number) {
    return getApiClient().delete<ApiResponse>(`/api/files/${fileId}`);
  },

  /** Extract text from an image using Cloudinary OCR */
  extractOcr(fileId: number) {
    return getApiClient().post<ApiResponse<{ file_id: number; ocr_text: string }>>(`/api/files/${fileId}/ocr`);
  },

  /** Get URL with background removed using Cloudinary AI */
  getBackgroundRemoved(fileId: number) {
    return getApiClient().get<ApiResponse<{ file_id: number; original_url: string; background_removed_url: string }>>(`/api/files/${fileId}/background-removed`);
  },

  /** Get detailed file info including AI tags and OCR text */
  getInfo(fileId: number) {
    return getApiClient().get<ApiResponse<FileRecord>>(`/api/files/${fileId}/info`);
  },
};
