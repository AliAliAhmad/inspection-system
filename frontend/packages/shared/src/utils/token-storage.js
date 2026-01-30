/**
 * Web implementation using localStorage.
 */
export class WebTokenStorage {
    async getAccessToken() {
        return localStorage.getItem('access_token');
    }
    async setAccessToken(token) {
        localStorage.setItem('access_token', token);
    }
    async getRefreshToken() {
        return localStorage.getItem('refresh_token');
    }
    async setRefreshToken(token) {
        localStorage.setItem('refresh_token', token);
    }
    async clear() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    }
}
//# sourceMappingURL=token-storage.js.map