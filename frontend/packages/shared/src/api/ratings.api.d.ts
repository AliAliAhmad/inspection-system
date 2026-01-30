import { ApiResponse, InspectionRating } from '../types';
export interface RateInspectionPayload {
    rating: number;
    comment?: string;
}
export declare const ratingsApi: {
    rateInspection(inspectionId: number, payload: RateInspectionPayload): Promise<import("axios").AxiosResponse<ApiResponse<InspectionRating>, any, {}>>;
    updateRating(inspectionId: number, payload: RateInspectionPayload): Promise<import("axios").AxiosResponse<ApiResponse<InspectionRating>, any, {}>>;
    getTechnicianRatings(technicianId: number): Promise<import("axios").AxiosResponse<ApiResponse<InspectionRating[]>, any, {}>>;
};
//# sourceMappingURL=ratings.api.d.ts.map