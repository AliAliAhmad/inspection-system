/**
 * Check if user has any of the specified roles (major or minor).
 */
export function canAccess(user, ...allowedRoles) {
    if (!user)
        return false;
    if (allowedRoles.length === 0)
        return true;
    return allowedRoles.includes(user.role) || (user.minor_role !== null && allowedRoles.includes(user.minor_role));
}
/**
 * Check if user is admin.
 */
export function isAdmin(user) {
    return user?.role === 'admin';
}
//# sourceMappingURL=role-guards.js.map