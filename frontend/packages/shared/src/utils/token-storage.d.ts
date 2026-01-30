/**
 * Abstract token storage interface.
 * Web implements with localStorage, mobile with expo-secure-store.
 */
export interface ITokenStorage {
    getAccessToken(): Promise<string | null>;
    setAccessToken(token: string): Promise<void>;
    getRefreshToken(): Promise<string | null>;
    setRefreshToken(token: string): Promise<void>;
    clear(): Promise<void>;
}
/**
 * Web implementation using localStorage.
 */
export declare class WebTokenStorage implements ITokenStorage {
    getAccessToken(): Promise<string | null>;
    setAccessToken(token: string): Promise<void>;
    getRefreshToken(): Promise<string | null>;
    setRefreshToken(token: string): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=token-storage.d.ts.map