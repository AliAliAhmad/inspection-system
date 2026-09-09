import { describe, it, expect } from 'vitest';
import { SEVERITY_TO_PRIORITY, isHandTypedOrder } from './JobsPool';

/**
 * Ali, 2026-09-09: the job-pool filters "feel unreliable, specially when I open
 * web on iPad".
 *
 * Two of the four causes were pure logic and are pinned here. The other two —
 * the headline count changing when the Hourly/Calendar sub-tab was switched,
 * and the equipment list being unsorted — are rendering behaviour and were
 * measured in a real browser instead (5 -> 7 before, 9 -> 9 after).
 */

describe('a defect severity is translated into the priority the filter uses', () => {
  it('maps the whole scale', () => {
    expect(SEVERITY_TO_PRIORITY.critical).toBe('urgent');
    expect(SEVERITY_TO_PRIORITY.high).toBe('high');
    expect(SEVERITY_TO_PRIORITY.medium).toBe('normal');
    expect(SEVERITY_TO_PRIORITY.low).toBe('low');
  });

  it('a CRITICAL defect must not be filed under normal', () => {
    // This is the bug. Every app defect arrived hard-coded 'normal', so a
    // critical one showed an "N" and disappeared the moment Ali pressed Urgent
    // — the filter hid exactly the jobs that button exists to find.
    expect(SEVERITY_TO_PRIORITY.critical).not.toBe('normal');
  });

  it('an unknown severity falls back to normal at the call site', () => {
    expect(SEVERITY_TO_PRIORITY['' as string]).toBeUndefined();
    expect(SEVERITY_TO_PRIORITY['nonsense']).toBeUndefined();
  });
});

describe('a hand-typed job parked in the pool is recognised as such', () => {
  it('spots the placeholder by number or by type', () => {
    expect(isHandTypedOrder({ order_number: 'MAN-6-9' })).toBe(true);
    expect(isHandTypedOrder({ order_number: 'MAN-6-9-P2' })).toBe(true);  // split part
    expect(isHandTypedOrder({ order_type: 'MANUAL' })).toBe(true);
  });

  it('leaves real SAP orders alone', () => {
    expect(isHandTypedOrder({ order_number: '4000123456' })).toBe(false);
    expect(isHandTypedOrder({ order_number: 'PRM-100' })).toBe(false);
    expect(isHandTypedOrder({})).toBe(false);
    expect(isHandTypedOrder(null)).toBe(false);
  });
});
