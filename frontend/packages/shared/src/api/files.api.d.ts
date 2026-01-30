import { ApiResponse, PaginatedResponse, PaginationParams, FileRecord } from '../types';
export interface FileListParams extends PaginationParams {
    related_type?: string;
    related_id?: number;
}
export declare const filesApi: {
    upload(file: File, relatedType: string, relatedId: number, category?: string): Promise<import("axios").AxiosResponse<ApiResponse<FileRecord>, any, {}>>;
    uploadMultiple(files: File[], relatedType: string, relatedId: number, category?: string): Promise<import("axios").AxiosResponse<ApiResponse<FileRecord[]>, any, {}>>;
    download(fileId: number): Promise<import("axios").AxiosResponse<Blob, any, {}>>;
    list(params?: FileListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<FileRecord>, any, {}>>;
    remove(fileId: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=files.api.d.ts.map