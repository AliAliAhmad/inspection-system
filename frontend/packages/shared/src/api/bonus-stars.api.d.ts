import { ApiResponse, BonusStar, AwardBonusPayload } from '../types';
export interface RequestBonusPayload {
    user_id: number;
    amount: number;
    reason: string;
    related_job_type?: string;
    related_job_id?: number;
}
export declare const bonusStarsApi: {
    list(): Promise<import("axios").AxiosResponse<ApiResponse<BonusStar[]>, any, {}>>;
    award(payload: AwardBonusPayload): Promise<import("axios").AxiosResponse<ApiResponse<BonusStar>, any, {}>>;
    requestBonus(payload: RequestBonusPayload): Promise<import("axios").AxiosResponse<ApiResponse<BonusStar>, any, {}>>;
    approveRequest(bonusId: number): Promise<import("axios").AxiosResponse<ApiResponse<BonusStar>, any, {}>>;
    denyRequest(bonusId: number): Promise<import("axios").AxiosResponse<ApiResponse<BonusStar>, any, {}>>;
};
//# sourceMappingURL=bonus-stars.api.d.ts.map