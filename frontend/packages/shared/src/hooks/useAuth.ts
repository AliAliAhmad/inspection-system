import { useState, useCallback } from 'react';
import { User } from '../types';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Shared auth state hook. Platform-specific providers wrap this.
 */
export function useAuthState() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const setUser = useCallback((user: User | null) => {
    setState({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    });
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState((prev) => ({ ...prev, isLoading }));
  }, []);

  return { ...state, setUser, setLoading };
}
