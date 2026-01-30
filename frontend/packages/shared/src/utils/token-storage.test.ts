import { describe, it, expect, beforeEach } from 'vitest';
import { WebTokenStorage } from './token-storage';

// Vitest with node env has no localStorage by default, so we polyfill a minimal one.
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};

// Inject into globalThis for WebTokenStorage
(globalThis as any).localStorage = mockLocalStorage;

describe('WebTokenStorage', () => {
  let storage: WebTokenStorage;

  beforeEach(() => {
    mockLocalStorage.clear();
    storage = new WebTokenStorage();
  });

  it('stores and retrieves access token', async () => {
    await storage.setAccessToken('access-123');
    expect(await storage.getAccessToken()).toBe('access-123');
  });

  it('stores and retrieves refresh token', async () => {
    await storage.setRefreshToken('refresh-456');
    expect(await storage.getRefreshToken()).toBe('refresh-456');
  });

  it('returns null when no access token is set', async () => {
    expect(await storage.getAccessToken()).toBeNull();
  });

  it('returns null when no refresh token is set', async () => {
    expect(await storage.getRefreshToken()).toBeNull();
  });

  it('clear removes both tokens', async () => {
    await storage.setAccessToken('access-123');
    await storage.setRefreshToken('refresh-456');
    await storage.clear();
    expect(await storage.getAccessToken()).toBeNull();
    expect(await storage.getRefreshToken()).toBeNull();
  });

  it('overwrites existing tokens', async () => {
    await storage.setAccessToken('old-token');
    await storage.setAccessToken('new-token');
    expect(await storage.getAccessToken()).toBe('new-token');
  });
});
