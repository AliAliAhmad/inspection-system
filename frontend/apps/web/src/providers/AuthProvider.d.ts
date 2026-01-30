import React from 'react';
import { AuthState } from '@inspection/shared';
interface AuthContextValue extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}
export declare function AuthProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useAuth(): AuthContextValue;
export {};
//# sourceMappingURL=AuthProvider.d.ts.map