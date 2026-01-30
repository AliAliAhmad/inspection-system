import { describe, it, expect } from 'vitest';
import { canAccess, isAdmin } from './role-guards';
import type { UserRole } from '../types';

// Helper to create a user object
function makeUser(role: UserRole, minor_role: UserRole | null = null) {
  return { role, minor_role };
}

describe('canAccess', () => {
  it('returns false when user is null', () => {
    expect(canAccess(null, 'admin')).toBe(false);
  });

  it('returns true when no roles are specified (empty allowedRoles)', () => {
    const user = makeUser('inspector');
    expect(canAccess(user)).toBe(true);
  });

  it('returns true when user major role matches', () => {
    const user = makeUser('admin');
    expect(canAccess(user, 'admin')).toBe(true);
  });

  it('returns false when user major role does not match', () => {
    const user = makeUser('inspector');
    expect(canAccess(user, 'admin')).toBe(false);
  });

  it('returns true when user minor_role matches an allowed role', () => {
    const user = makeUser('inspector', 'specialist');
    expect(canAccess(user, 'specialist')).toBe(true);
  });

  it('returns false when neither major nor minor role matches', () => {
    const user = makeUser('inspector', 'specialist');
    expect(canAccess(user, 'admin', 'engineer')).toBe(false);
  });

  it('returns true when major role matches one of multiple allowed roles', () => {
    const user = makeUser('engineer');
    expect(canAccess(user, 'admin', 'engineer', 'inspector')).toBe(true);
  });

  it('returns true when minor_role matches one of multiple allowed roles', () => {
    const user = makeUser('inspector', 'quality_engineer');
    expect(canAccess(user, 'admin', 'quality_engineer')).toBe(true);
  });

  it('handles user with null minor_role correctly', () => {
    const user = makeUser('specialist', null);
    expect(canAccess(user, 'inspector')).toBe(false);
  });

  it('checks all five roles correctly via major role', () => {
    const roles: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];
    for (const role of roles) {
      const user = makeUser(role);
      expect(canAccess(user, role)).toBe(true);
    }
  });

  it('returns true with empty allowedRoles even when user is null-ish', () => {
    // With an actual user but no roles specified
    const user = makeUser('inspector');
    expect(canAccess(user)).toBe(true);
  });
});

describe('isAdmin', () => {
  it('returns true for admin user', () => {
    expect(isAdmin({ role: 'admin' })).toBe(true);
  });

  it('returns false for non-admin user', () => {
    expect(isAdmin({ role: 'inspector' })).toBe(false);
    expect(isAdmin({ role: 'specialist' })).toBe(false);
    expect(isAdmin({ role: 'engineer' })).toBe(false);
    expect(isAdmin({ role: 'quality_engineer' })).toBe(false);
  });

  it('returns false for null user', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('returns false for undefined user', () => {
    expect(isAdmin(undefined as unknown as null)).toBe(false);
  });
});
