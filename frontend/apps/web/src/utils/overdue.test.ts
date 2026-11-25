import { describe, it, expect } from 'vitest';
import { getOverdueInfo, isJobOverdue, computeOverdueMax } from './overdue';

// Ali, 2026-11-25: "the PRM overdue hrs for the hourly base service is not
// showing". The nightly SAP sync stores hours PAST the service as a POSITIVE
// number; the board read positive hours as "still to go" and hid the badge.
describe('getOverdueInfo', () => {
  it('shows an hourly PM that is past its service, as the sync stores it', () => {
    const info = getOverdueInfo({ overdue_value: 120, overdue_unit: 'hours' });
    expect(info).toEqual({ isOverdue: true, amount: 120, unit: 'hours', shortUnit: 'h' });
  });

  it('does not show an hourly PM that still has hours to go', () => {
    expect(isJobOverdue({ overdue_value: -30, overdue_unit: 'hours' })).toBe(false);
  });

  it('keeps the day-based rule unchanged', () => {
    expect(getOverdueInfo({ overdue_value: 9, overdue_unit: 'days' }).amount).toBe(9);
    expect(isJobOverdue({ overdue_value: 0, overdue_unit: 'days' })).toBe(false);
    expect(isJobOverdue({ overdue_value: null, overdue_unit: null })).toBe(false);
  });

  it('scales the heat by the worst hourly PM', () => {
    expect(computeOverdueMax([
      { overdue_value: 120, overdue_unit: 'hours' },
      { overdue_value: 400, overdue_unit: 'hours' },
      { overdue_value: 12, overdue_unit: 'days' },
    ])).toEqual({ days: 12, hours: 400 });
  });
});
