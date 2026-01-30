import { describe, it, expect } from 'vitest';
import { sanitizeInput, stripHtml, isSafeFilename, sanitizeUrl } from './sanitize';

describe('sanitizeInput', () => {
  it('escapes HTML angle brackets', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('<');
    expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('>');
  });

  it('escapes ampersands', () => {
    expect(sanitizeInput('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes double quotes', () => {
    expect(sanitizeInput('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(sanitizeInput("it's")).toContain('&#x27;');
  });

  it('escapes forward slashes', () => {
    expect(sanitizeInput('a/b')).toContain('&#x2F;');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('leaves safe alphanumeric text unchanged', () => {
    expect(sanitizeInput('hello world 123')).toBe('hello world 123');
  });
});

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('removes nested tags', () => {
    expect(stripHtml('<div><b>bold</b> text</div>')).toBe('bold text');
  });

  it('removes script tags', () => {
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('no tags here')).toBe('no tags here');
  });
});

describe('isSafeFilename', () => {
  it('accepts a normal filename', () => {
    expect(isSafeFilename('report.pdf')).toBe(true);
  });

  it('accepts filenames with spaces', () => {
    expect(isSafeFilename('my report.pdf')).toBe(true);
  });

  it('rejects filenames with angle brackets', () => {
    expect(isSafeFilename('file<name>.txt')).toBe(false);
  });

  it('rejects filenames with colons', () => {
    expect(isSafeFilename('file:name.txt')).toBe(false);
  });

  it('rejects filenames with double quotes', () => {
    expect(isSafeFilename('file"name.txt')).toBe(false);
  });

  it('rejects filenames with pipe', () => {
    expect(isSafeFilename('file|name.txt')).toBe(false);
  });

  it('rejects filenames with question mark', () => {
    expect(isSafeFilename('file?name.txt')).toBe(false);
  });

  it('rejects filenames with asterisk', () => {
    expect(isSafeFilename('file*name.txt')).toBe(false);
  });

  it('rejects filenames with backslash', () => {
    expect(isSafeFilename('file\\name.txt')).toBe(false);
  });

  it('rejects empty filename', () => {
    expect(isSafeFilename('')).toBe(false);
  });

  it('rejects filename over 255 chars', () => {
    expect(isSafeFilename('a'.repeat(256))).toBe(false);
  });

  it('accepts filename at exactly 255 chars', () => {
    expect(isSafeFilename('a'.repeat(255))).toBe(true);
  });

  it('rejects filenames with null bytes', () => {
    expect(isSafeFilename('file\x00name')).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  it('blocks javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
  });

  it('blocks JavaScript: with mixed case', () => {
    expect(sanitizeUrl('JavaScript:alert(1)')).toBe('#');
  });

  it('blocks data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
  });

  it('blocks vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:msgbox')).toBe('#');
  });

  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative URLs', () => {
    expect(sanitizeUrl('/api/resource')).toBe('/api/resource');
  });

  it('trims whitespace', () => {
    expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('blocks javascript: with leading whitespace', () => {
    expect(sanitizeUrl('  javascript:alert(1)')).toBe('#');
  });
});
