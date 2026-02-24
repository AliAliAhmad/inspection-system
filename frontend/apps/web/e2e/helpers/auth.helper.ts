import { Page } from '@playwright/test';

export const CREDENTIALS = {
  admin:       { username: 'ali.k.a',      password: '500628' },
  engineer:    { username: 'hussein.a.a',  password: '500017' },
  inspector:   { username: 'mohamed.q.h',  password: '500834' },
  specialist:  { username: 'mayuid.a.s',   password: '500552' },
  maintenance: { username: 'mohamed.l.y',  password: '500017' },
} as const;

export type Role = keyof typeof CREDENTIALS;

/**
 * Real login against production. Handles Render cold-start delays.
 * Caller should set test.setTimeout(120000) for tests using this.
 */
export async function loginAs(page: Page, role: Role): Promise<void> {
  const { username, password } = CREDENTIALS[role];
  await page.goto('/');
  // Form item name="email" accepts username too
  await page.getByPlaceholder(/email or username/i).fill(username);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
  await page.waitForSelector('.app-header', { timeout: 90000 });
}

/**
 * Logout via the user dropdown in the header.
 */
export async function logout(page: Page): Promise<void> {
  // Click the avatar/name Space in the header
  await page.locator('.app-header').locator('.ant-space').last().click();
  await page.locator('.ant-dropdown-menu-item').filter({ hasText: /log.?out/i }).click();
  await page.waitForSelector('input', { timeout: 15000 });
}

// ── Mock auth for unit/UI tests (no real network call) ──

export interface MockUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

export const MOCK_USERS: Record<string, MockUser> = {
  admin:     { id: 1, username: 'ali.k.a',      full_name: 'Ali Admin',       role: 'admin' },
  inspector: { id: 2, username: 'inspector1',   full_name: 'Test Inspector',  role: 'inspector' },
  engineer:  { id: 3, username: 'hussein',      full_name: 'Hussein Engineer', role: 'engineer' },
  specialist:{ id: 4, username: 'specialist1',  full_name: 'Test Specialist', role: 'specialist' },
  qe:        { id: 5, username: 'qe1',          full_name: 'QE User',         role: 'quality_engineer' },
};

/**
 * Inject a mock session — no real API call. Used for UI/unit tests.
 */
export async function mockLoginAs(page: Page, user: MockUser): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'fake-jwt-token');
    localStorage.setItem('refresh_token', 'fake-refresh-token');
  });
}
