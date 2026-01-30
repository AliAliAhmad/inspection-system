import { UserRole } from '../types';

/**
 * Check if user has any of the specified roles (major or minor).
 */
export function canAccess(
  user: { role: UserRole; minor_role: UserRole | null } | null,
  ...allowedRoles: UserRole[]
): boolean {
  if (!user) return false;
  if (allowedRoles.length === 0) return true;
  return allowedRoles.includes(user.role) || (user.minor_role !== null && allowedRoles.includes(user.minor_role));
}

/**
 * Check if user is admin.
 */
export function isAdmin(user: { role: UserRole } | null): boolean {
  return user?.role === 'admin';
}
