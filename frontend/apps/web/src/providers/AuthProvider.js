import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useCallback } from 'react';
import { useAuthState, authApi, initApiClient, WebTokenStorage, } from '@inspection/shared';
const tokenStorage = new WebTokenStorage();
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const { user, isAuthenticated, isLoading, setUser, setLoading } = useAuthState();
    // Initialize API client with token storage
    useEffect(() => {
        initApiClient(import.meta.env.VITE_API_URL || '', tokenStorage);
        // Try to restore session from stored token
        tokenStorage.getAccessToken().then((token) => {
            if (token) {
                authApi
                    .getProfile()
                    .then((res) => setUser(res.data.user ?? res.data))
                    .catch(() => {
                    tokenStorage.clear();
                    setUser(null);
                });
            }
            else {
                setUser(null);
            }
        });
    }, [setUser]);
    // Listen for forced logout from token refresh failure in API client
    useEffect(() => {
        const handleForcedLogout = () => {
            tokenStorage.clear();
            setUser(null);
        };
        window.addEventListener('auth:logout', handleForcedLogout);
        return () => window.removeEventListener('auth:logout', handleForcedLogout);
    }, [setUser]);
    const login = useCallback(async (email, password) => {
        setLoading(true);
        try {
            const res = await authApi.login({ email, password });
            const data = res.data;
            await tokenStorage.setAccessToken(data.access_token);
            await tokenStorage.setRefreshToken(data.refresh_token);
            setUser(data.user);
        }
        finally {
            setLoading(false);
        }
    }, [setUser, setLoading]);
    const logout = useCallback(async () => {
        try {
            await authApi.logout();
        }
        catch {
            // Ignore errors
        }
        finally {
            await tokenStorage.clear();
            setUser(null);
        }
    }, [setUser]);
    return (_jsx(AuthContext.Provider, { value: { user, isAuthenticated, isLoading, login, logout }, children: children }));
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
//# sourceMappingURL=AuthProvider.js.map