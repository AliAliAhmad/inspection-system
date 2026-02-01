import React, { createContext, useContext, useEffect, useCallback } from 'react';
import {
  useAuthState,
  AuthState,
  authApi,
  initApiClient,
  User,
} from '@inspection/shared';
import { tokenStorage } from '../storage/token-storage';
import { environment } from '../config/environment';

const API_BASE_URL = environment.apiUrl;

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, setUser, setLoading } = useAuthState();

  useEffect(() => {
    async function init() {
      initApiClient(API_BASE_URL, tokenStorage);

      const token = await tokenStorage.getAccessToken();
      if (token) {
        try {
          const res = await authApi.getProfile();
          setUser((res.data as any).user ?? (res.data as unknown as User));
        } catch {
          await tokenStorage.clear();
          setUser(null);
        }
      } else {
        setUser(null);
      }
    }
    init();
  }, [setUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      try {
        const res = await authApi.login({ email: username, password });
        const data = res.data;
        await tokenStorage.setAccessToken(data.access_token);
        await tokenStorage.setRefreshToken(data.refresh_token);
        setUser(data.user);
      } finally {
        setLoading(false);
      }
    },
    [setUser, setLoading],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore
    } finally {
      await tokenStorage.clear();
      setUser(null);
    }
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
