import { ApiResponse, PaginatedResponse, PaginationParams, InspectionList, InspectionAssignment } from '../types';
export interface AssignmentListParams extends PaginationParams {
    shift?: 'day' | 'night';
    target_date?: string;
}
export interface GenerateListPayload {
    target_date: string;
    shift: 'day' | 'night';
}
export interface AssignTeamPayload {
    mechanical_inspector_id: number;
    electrical_inspector_id: number;
}
export interface MyAssignmentsParams extends PaginationParams {
    status?: string;
}
export declare const inspectionAssignmentsApi: {
    getLists(params?: AssignmentListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<InspectionList>, any, {}>>;
    generateList(payload: GenerateListPayload): Promise<import("axios").AxiosResponse<ApiResponse<InspectionList>, any, {}>>;
    getList(listId: number): Promise<import("axios").AxiosResponse<ApiResponse<InspectionList>, any, {}>>;
    assignTeam(assignmentId: number, payload: AssignTeamPayload): Promise<import("axios").AxiosResponse<ApiResponse<InspectionAssignment>, any, {}>>;
    updateBerth(assignmentId: number, berth: string): Promise<import("axios").AxiosResponse<ApiResponse<InspectionAssignment>, any, {}>>;
    getMyAssignments(params?: MyAssignmentsParams): Promise<import("axios").AxiosResponse<PaginatedResponse<InspectionAssignment>, any, {}>>;
    completeAssignment(assignmentId: number): Promise<import("axios").AxiosResponse<ApiResponse<InspectionAssignment>, any, {}>>;
    getBacklog(): Promise<import("axios").AxiosResponse<ApiResponse<InspectionAssignment[]>, any, {}>>;
};
//# sourceMappingURL=inspection-assignments.api.d.ts.map