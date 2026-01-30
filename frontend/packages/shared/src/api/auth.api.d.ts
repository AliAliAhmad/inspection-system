import { ApiResponse, AuthResponse, User } from '../types';
export declare const authApi: {
    login(credentials: {
        email: string;
        password: string;
    }): Promise<import("axios").AxiosResponse<AuthResponse, any, {}>>;
    refresh(): Promise<import("axios").AxiosResponse<AuthResponse, any, {}>>;
    getProfile(): Promise<import("axios").AxiosResponse<ApiResponse<User>, any, {}>>;
    logout(): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=auth.api.d.ts.map