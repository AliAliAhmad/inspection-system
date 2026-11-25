import { describe, it, expect } from 'vitest';
import { formatDue, machineCode } from './PrmOverdue';

// The tag finds a card's machine by its plant code, which the equipment screen
// uses as the name. A wrong match would put a red tag on the wrong machine.
describe('machineCode', () => {
  it('reads the plant code at the start of the name', () => {
    expect(machineCode('TT058')).toBe('TT058');
    expect(machineCode('tt058 - Terminal Tractor')).toBe('TT058');
    expect(machineCode('ECH02')).toBe('ECH02');
  });
  it('does not invent a code', () => {
    expect(machineCode('Job #12')).toBeNull();
    expect(machineCode('')).toBeNull();
    expect(machineCode(undefined)).toBeNull();
  });
  it('does not confuse TT05 with TT058', () => {
    expect(machineCode('TT058')).not.toBe('TT05');
  });
});

// Ali, 2026-11-26: "Like SAP: -91 = overdue". The sign is always shown, so a
// late machine can never read like one with hours to spare.
describe('formatDue', () => {
  it('keeps SAP\'s sign', () => {
    expect(formatDue(-91)).toBe('-91');
    expect(formatDue(12.82)).toBe('+12.82');
    expect(formatDue(0)).toBe('0');
  });
  it('says unknown, never zero, when there is no number', () => {
    expect(formatDue(null)).toBe('?');
    expect(formatDue(undefined)).toBe('?');
  });
});
