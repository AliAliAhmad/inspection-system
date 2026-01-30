import { useState, useCallback } from 'react';
/**
 * Shared auth state hook. Platform-specific providers wrap this.
 */
export function useAuthState() {
    const [state, setState] = useState({
        user: null,
        isAuthenticated: false,
        isLoading: true,
    });
    const setUser = useCallback((user) => {
        setState({
            user,
            isAuthenticated: !!user,
            isLoading: false,
        });
    }, []);
    const setLoading = useCallback((isLoading) => {
        setState((prev) => ({ ...prev, isLoading }));
    }, []);
    return { ...state, setUser, setLoading };
}
//# sourceMappingURL=useAuth.js.map