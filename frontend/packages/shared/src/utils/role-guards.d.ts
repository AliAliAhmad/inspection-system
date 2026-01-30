import { UserRole } from '../types';
/**
 * Check if user has any of the specified roles (major or minor).
 */
export declare function canAccess(user: {
    role: UserRole;
    minor_role: UserRole | null;
} | null, ...allowedRoles: UserRole[]): boolean;
/**
 * Check if user is admin.
 */
export declare function isAdmin(user: {
    role: UserRole;
} | null): boolean;
//# sourceMappingURL=role-guards.d.ts.map