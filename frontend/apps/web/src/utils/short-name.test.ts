import { describe, it, expect } from 'vitest';
import { shortName } from './short-name';

describe('shortName', () => {
  it("is Ali's own example: first name, then a letter for every other name", () => {
    expect(shortName('Ali Kadhim Abbas Ahmed')).toBe('Ali.K.A.A');
  });

  it('tells two men with the same first name apart', () => {
    expect(shortName('Ali Kadhim Abbas')).not.toBe(shortName('Ali Hassan Jaber'));
  });

  it('leaves a one-word name alone', () => {
    expect(shortName('Hassan')).toBe('Hassan');
  });

  it('ignores extra spaces', () => {
    expect(shortName('  Ali   kadhim  ')).toBe('Ali.K');
  });

  it('works for Arabic', () => {
    expect(shortName('علي كاظم عباس')).toBe('علي.ك.ع');
  });

  it('is empty for no name, never "undefined"', () => {
    expect(shortName(undefined)).toBe('');
    expect(shortName(null)).toBe('');
    expect(shortName('')).toBe('');
  });
});
