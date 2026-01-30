import { ApiResponse, DefectAssessment } from '../types';
export interface CreateDefectAssessmentPayload {
    defect_id: number;
    verdict: 'confirm' | 'reject' | 'minor';
    technical_notes: string;
}
export declare const defectAssessmentsApi: {
    list(): Promise<import("axios").AxiosResponse<ApiResponse<DefectAssessment[]>, any, {}>>;
    getPending(): Promise<import("axios").AxiosResponse<ApiResponse<DefectAssessment[]>, any, {}>>;
    create(payload: CreateDefectAssessmentPayload): Promise<import("axios").AxiosResponse<ApiResponse<DefectAssessment>, any, {}>>;
};
//# sourceMappingURL=defect-assessments.api.d.ts.map