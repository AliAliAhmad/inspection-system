// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// Polyfill localStorage for node environment
const store = {};
globalThis.localStorage = {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store))
        delete store[k]; },
};
import { loginRateLimiter } from './rate-limiter';
describe('loginRateLimiter', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it('allows first attempt', () => {
        expect(loginRateLimiter.check().allowed).toBe(true);
    });
    it('allows up to 5 rapid failures', () => {
        for (let i = 0; i < 4; i++) {
            loginRateLimiter.recordFailure();
            expect(loginRateLimiter.check().allowed).toBe(true);
        }
    });
    it('locks out after 5 failures', () => {
        for (let i = 0; i < 5; i++) {
            loginRateLimiter.recordFailure();
        }
        const result = loginRateLimiter.check();
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });
    it('unlocks after lockout period', () => {
        for (let i = 0; i < 5; i++) {
            loginRateLimiter.recordFailure();
        }
        loginRateLimiter.check(); // triggers lockout
        // Advance past 5-minute lockout
        vi.advanceTimersByTime(300001);
        expect(loginRateLimiter.check().allowed).toBe(true);
    });
    it('resets state on successful login', () => {
        for (let i = 0; i < 4; i++) {
            loginRateLimiter.recordFailure();
        }
        loginRateLimiter.reset();
        expect(loginRateLimiter.check().allowed).toBe(true);
    });
    it('resets attempt count after window expires', () => {
        for (let i = 0; i < 4; i++) {
            loginRateLimiter.recordFailure();
        }
        // Advance past 1-minute window
        vi.advanceTimersByTime(60001);
        expect(loginRateLimiter.check().allowed).toBe(true);
    });
    it('records failure correctly after window reset', () => {
        loginRateLimiter.recordFailure();
        // Advance past window
        vi.advanceTimersByTime(60001);
        // Should reset to 1 attempt
        loginRateLimiter.recordFailure();
        expect(loginRateLimiter.check().allowed).toBe(true);
    });
});
//# sourceMappingURL=rate-limiter.test.js.map