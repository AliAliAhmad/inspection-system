import { describe, it, expect } from 'vitest';
import { ROLES, ROLE_LABELS, ROLE_LABELS_AR, hasRole } from './roles';
import type { UserRole } from '../types';

describe('ROLES constants', () => {
  it('contains all five expected roles', () => {
    expect(ROLES.ADMIN).toBe('admin');
    expect(ROLES.INSPECTOR).toBe('inspector');
    expect(ROLES.SPECIALIST).toBe('specialist');
    expect(ROLES.ENGINEER).toBe('engineer');
    expect(ROLES.QUALITY_ENGINEER).toBe('quality_engineer');
  });

  it('has exactly 5 role entries', () => {
    expect(Object.keys(ROLES)).toHaveLength(5);
  });
});

describe('ROLE_LABELS', () => {
  it('has a label for every role', () => {
    const allRoles: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];
    for (const role of allRoles) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(typeof ROLE_LABELS[role]).toBe('string');
    }
  });

  it('maps roles to correct English labels', () => {
    expect(ROLE_LABELS.admin).toBe('Admin');
    expect(ROLE_LABELS.inspector).toBe('Inspector');
    expect(ROLE_LABELS.specialist).toBe('Specialist');
    expect(ROLE_LABELS.engineer).toBe('Engineer');
    expect(ROLE_LABELS.quality_engineer).toBe('Quality Engineer');
  });

  it('has exactly 5 entries', () => {
    expect(Object.keys(ROLE_LABELS)).toHaveLength(5);
  });
});

describe('ROLE_LABELS_AR', () => {
  it('has an Arabic label for every role', () => {
    const allRoles: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];
    for (const role of allRoles) {
      expect(ROLE_LABELS_AR[role]).toBeTruthy();
      expect(typeof ROLE_LABELS_AR[role]).toBe('string');
    }
  });

  it('has exactly 5 entries', () => {
    expect(Object.keys(ROLE_LABELS_AR)).toHaveLength(5);
  });

  it('Arabic labels differ from English labels', () => {
    const allRoles: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];
    for (const role of allRoles) {
      expect(ROLE_LABELS_AR[role]).not.toBe(ROLE_LABELS[role]);
    }
  });
});

describe('hasRole', () => {
  function makeUser(role: UserRole, minor_role: UserRole | null = null) {
    return { role, minor_role };
  }

  it('returns true when user major role matches', () => {
    const user = makeUser('admin');
    expect(hasRole(user, 'admin')).toBe(true);
  });

  it('returns false when user major role does not match', () => {
    const user = makeUser('inspector');
    expect(hasRole(user, 'admin')).toBe(false);
  });

  it('returns true when user minor_role matches', () => {
    const user = makeUser('inspector', 'engineer');
    expect(hasRole(user, 'engineer')).toBe(true);
  });

  it('returns false when neither role matches', () => {
    const user = makeUser('inspector', 'specialist');
    expect(hasRole(user, 'admin', 'engineer')).toBe(false);
  });

  it('returns true when major role matches one of multiple roles', () => {
    const user = makeUser('quality_engineer');
    expect(hasRole(user, 'admin', 'quality_engineer')).toBe(true);
  });

  it('handles null minor_role without error', () => {
    const user = makeUser('specialist', null);
    expect(hasRole(user, 'inspector')).toBe(false);
    expect(hasRole(user, 'specialist')).toBe(true);
  });

  it('checks all roles correctly', () => {
    const roles: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];
    for (const role of roles) {
      expect(hasRole(makeUser(role), role)).toBe(true);
      // Ensure other roles don't match
      const otherRoles = roles.filter(r => r !== role);
      expect(hasRole(makeUser(role), ...otherRoles)).toBe(false);
    }
  });
});
