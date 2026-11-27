import { describe, it, expect } from 'vitest';
import { daysSince } from './LastPm';

describe('daysSince (Rule 1, last PM line)', () => {
  const today = new Date(2026, 10, 27); // 27 Nov 2026, local time

  it('counts whole days back to the last PM', () => {
    expect(daysSince('2026-08-24', today)).toBe(95);
  });

  it('is 0 on the same day', () => {
    expect(daysSince('2026-11-27', today)).toBe(0);
  });

  it('never goes negative for a date after today', () => {
    expect(daysSince('2026-12-01', today)).toBe(0);
  });

  it('crosses a year correctly', () => {
    expect(daysSince('2025-11-27', today)).toBe(365);
  });
});
