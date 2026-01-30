interface RateLimitState {
  attempts: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

const STORAGE_KEY = 'login-rate-limit';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute
const LOCKOUT_MS = 300_000; // 5 minutes

function getState(): RateLimitState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { attempts: 0, lastAttempt: 0, lockedUntil: null };
}

function setState(state: RateLimitState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const loginRateLimiter = {
  /**
   * Check if the user can attempt login.
   * Returns { allowed: true } or { allowed: false, retryAfterMs }.
   */
  check(): { allowed: boolean; retryAfterMs?: number } {
    const state = getState();
    const now = Date.now();

    // Check lockout
    if (state.lockedUntil && now < state.lockedUntil) {
      return { allowed: false, retryAfterMs: state.lockedUntil - now };
    }

    // Reset if window expired
    if (now - state.lastAttempt > WINDOW_MS) {
      setState({ attempts: 0, lastAttempt: 0, lockedUntil: null });
      return { allowed: true };
    }

    if (state.attempts >= MAX_ATTEMPTS) {
      const lockedUntil = now + LOCKOUT_MS;
      setState({ ...state, lockedUntil });
      return { allowed: false, retryAfterMs: LOCKOUT_MS };
    }

    return { allowed: true };
  },

  /**
   * Record a failed login attempt.
   */
  recordFailure(): void {
    const state = getState();
    const now = Date.now();

    // Reset if window expired
    if (now - state.lastAttempt > WINDOW_MS) {
      setState({ attempts: 1, lastAttempt: now, lockedUntil: null });
      return;
    }

    const attempts = state.attempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;
    setState({ attempts, lastAttempt: now, lockedUntil });
  },

  /**
   * Clear rate limit state on successful login.
   */
  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
