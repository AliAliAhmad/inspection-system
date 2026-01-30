import { UserRole } from '../types';
export declare const ROLES: {
    ADMIN: UserRole;
    INSPECTOR: UserRole;
    SPECIALIST: UserRole;
    ENGINEER: UserRole;
    QUALITY_ENGINEER: UserRole;
};
export declare const ROLE_LABELS: Record<UserRole, string>;
export declare const ROLE_LABELS_AR: Record<UserRole, string>;
export declare function hasRole(user: {
    role: UserRole;
    minor_role: UserRole | null;
}, ...roles: UserRole[]): boolean;
//# sourceMappingURL=roles.d.ts.map