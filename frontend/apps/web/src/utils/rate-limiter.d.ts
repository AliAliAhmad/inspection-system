export declare const loginRateLimiter: {
    /**
     * Check if the user can attempt login.
     * Returns { allowed: true } or { allowed: false, retryAfterMs }.
     */
    check(): {
        allowed: boolean;
        retryAfterMs?: number;
    };
    /**
     * Record a failed login attempt.
     */
    recordFailure(): void;
    /**
     * Clear rate limit state on successful login.
     */
    reset(): void;
};
//# sourceMappingURL=rate-limiter.d.ts.map