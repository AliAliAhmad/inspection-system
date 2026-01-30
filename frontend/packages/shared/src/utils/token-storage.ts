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
export class WebTokenStorage implements ITokenStorage {
  async getAccessToken() {
    return localStorage.getItem('access_token');
  }
  async setAccessToken(token: string) {
    localStorage.setItem('access_token', token);
  }
  async getRefreshToken() {
    return localStorage.getItem('refresh_token');
  }
  async setRefreshToken(token: string) {
    localStorage.setItem('refresh_token', token);
  }
  async clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}
