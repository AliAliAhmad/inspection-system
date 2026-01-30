import { User } from '../types';
export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}
/**
 * Shared auth state hook. Platform-specific providers wrap this.
 */
export declare function useAuthState(): {
    setUser: (user: User | null) => void;
    setLoading: (isLoading: boolean) => void;
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
};
//# sourceMappingURL=useAuth.d.ts.map