import { UserRole } from '../types';

export const ROLES = {
  ADMIN: 'admin' as UserRole,
  INSPECTOR: 'inspector' as UserRole,
  SPECIALIST: 'specialist' as UserRole,
  ENGINEER: 'engineer' as UserRole,
  QUALITY_ENGINEER: 'quality_engineer' as UserRole,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  inspector: 'Inspector',
  specialist: 'Specialist',
  engineer: 'Engineer',
  quality_engineer: 'Quality Engineer',
};

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  admin: '\u0645\u062F\u064A\u0631',
  inspector: '\u0645\u0641\u062A\u0634',
  specialist: '\u0623\u062E\u0635\u0627\u0626\u064A',
  engineer: '\u0645\u0647\u0646\u062F\u0633',
  quality_engineer: '\u0645\u0647\u0646\u062F\u0633 \u062C\u0648\u062F\u0629',
};

export function hasRole(user: { role: UserRole; minor_role: UserRole | null }, ...roles: UserRole[]): boolean {
  return roles.includes(user.role) || (user.minor_role !== null && roles.includes(user.minor_role));
}
