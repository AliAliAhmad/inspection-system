import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDate, formatDateTime, formatHours, timeAgo } from './date-utils';

describe('formatDate', () => {
  it('returns "-" for null input', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(formatDate('')).toBe('-');
  });

  it('formats a valid ISO date string', () => {
    const result = formatDate('2024-06-15T10:30:00Z');
    // toLocaleDateString output varies by locale, but should be a non-empty string
    expect(result).toBeTruthy();
    expect(result).not.toBe('-');
  });

  it('returns a consistent result for the same date', () => {
    const a = formatDate('2024-01-01T00:00:00Z');
    const b = formatDate('2024-01-01T00:00:00Z');
    expect(a).toBe(b);
  });

  it('handles date-only ISO strings', () => {
    const result = formatDate('2024-12-25');
    expect(result).toBeTruthy();
    expect(result).not.toBe('-');
  });
});

describe('formatDateTime', () => {
  it('returns "-" for null input', () => {
    expect(formatDateTime(null)).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(formatDateTime('')).toBe('-');
  });

  it('formats a valid ISO datetime string with date and time', () => {
    const result = formatDateTime('2024-06-15T14:30:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('-');
    // Should contain both date and time portions (space-separated)
    expect(result).toContain(' ');
  });

  it('returns a consistent result for the same datetime', () => {
    const a = formatDateTime('2024-03-10T08:45:00Z');
    const b = formatDateTime('2024-03-10T08:45:00Z');
    expect(a).toBe(b);
  });
});

describe('formatHours', () => {
  it('returns "-" for null input', () => {
    expect(formatHours(null)).toBe('-');
  });

  it('returns "-" for undefined input', () => {
    expect(formatHours(undefined as unknown as null)).toBe('-');
  });

  it('formats whole hours without minutes', () => {
    expect(formatHours(3)).toBe('3h');
  });

  it('formats minutes only when hours is 0', () => {
    expect(formatHours(0.5)).toBe('30m');
  });

  it('formats hours and minutes together', () => {
    expect(formatHours(2.5)).toBe('2h 30m');
  });

  it('formats 1.75 hours as 1h 45m', () => {
    expect(formatHours(1.75)).toBe('1h 45m');
  });

  it('formats 0 hours as 0m', () => {
    expect(formatHours(0)).toBe('0m');
  });

  it('handles large values', () => {
    expect(formatHours(100)).toBe('100h');
  });

  it('handles fractional minutes that round', () => {
    // 0.33 hours = 19.8 minutes, rounds to 20m
    expect(formatHours(0.33)).toBe('20m');
  });

  it('handles values with hours and small fractional minutes', () => {
    // 5.1 hours = 5h 6m
    expect(formatHours(5.1)).toBe('5h 6m');
  });
});

describe('timeAgo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "just now" for very recent timestamps', () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe('just now');
  });

  it('returns minutes ago for timestamps within the last hour', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(fiveMinutesAgo)).toBe('5m ago');
  });

  it('returns hours ago for timestamps within the last day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(threeHoursAgo)).toBe('3h ago');
  });

  it('returns days ago for timestamps older than a day', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(twoDaysAgo)).toBe('2d ago');
  });

  it('returns "1m ago" for exactly 1 minute ago', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    expect(timeAgo(oneMinuteAgo)).toBe('1m ago');
  });

  it('returns "1h ago" for exactly 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(timeAgo(oneHourAgo)).toBe('1h ago');
  });

  it('returns "1d ago" for exactly 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(oneDayAgo)).toBe('1d ago');
  });

  it('boundary: 59 minutes returns minutes not hours', () => {
    const fiftyNineMinutesAgo = new Date(Date.now() - 59 * 60 * 1000).toISOString();
    expect(timeAgo(fiftyNineMinutesAgo)).toBe('59m ago');
  });

  it('boundary: 23 hours returns hours not days', () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(twentyThreeHoursAgo)).toBe('23h ago');
  });
});
