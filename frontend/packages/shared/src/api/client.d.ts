import { AxiosInstance } from 'axios';
import { ITokenStorage } from '../utils/token-storage';
declare let apiClient: AxiosInstance;
/**
 * Initialize the API client.
 * Must be called once at app startup with the appropriate token storage.
 */
export declare function initApiClient(baseURL: string, storage: ITokenStorage): AxiosInstance;
/**
 * Set the Accept-Language header for all requests.
 */
export declare function setLanguage(lang: 'en' | 'ar'): void;
/**
 * Get the initialized API client.
 */
export declare function getApiClient(): AxiosInstance;
export { apiClient };
//# sourceMappingURL=client.d.ts.map