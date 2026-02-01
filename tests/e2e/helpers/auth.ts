import { Page, expect } from '@playwright/test';
import { ENV } from './env';

/**
 * Login via the real UI login form.
 * Fills in email + password, clicks submit, waits for dashboard to load.
 */
export async function loginViaUI(
  page: Page,
  email: string = ENV.ADMIN_EMAIL,
  password: string = ENV.ADMIN_PASSWORD,
) {
  await page.goto('/');

  // Wait for login form to appear (the app renders LoginPage when unauthenticated)
  const emailInput = page.getByPlaceholder(/email/i);
  await expect(emailInput).toBeVisible({ timeout: 20_000 });

  // Fill credentials
  await emailInput.fill(email);
  await page.getByPlaceholder(/password/i).fill(password);

  // Click login button
  await page.getByRole('button', { name: /log\s*in|sign\s*in|تسجيل/i }).click();

  // Wait for the main layout to appear (ProLayout renders after successful auth)
  await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 20_000 });
}

/**
 * Login via direct API call and inject token into localStorage.
 * Faster than UI login — use for tests that need auth but aren't testing login.
 */
export async function loginViaAPI(
  page: Page,
  email: string = ENV.ADMIN_EMAIL,
  password: string = ENV.ADMIN_PASSWORD,
) {
  // Make API call directly
  const response = await page.request.post('/api/auth/login', {
    data: { email, password },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Login API failed (${response.status()}): ${body}`);
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;

  if (!accessToken) {
    throw new Error('Login response missing access_token');
  }

  // Inject tokens into localStorage before page loads
  await page.addInitScript(
    ({ access, refresh }) => {
      localStorage.setItem('access_token', access);
      if (refresh) localStorage.setItem('refresh_token', refresh);
    },
    { access: accessToken, refresh: refreshToken },
  );

  return { accessToken, refreshToken, user: data.user };
}

/**
 * Check if the page is showing the login form (unauthenticated state).
 */
export async function isOnLoginPage(page: Page): Promise<boolean> {
  const emailInput = page.getByPlaceholder(/email/i);
  return emailInput.isVisible({ timeout: 3_000 }).catch(() => false);
}

/**
 * Verify the user is authenticated and on the main layout.
 */
export async function expectAuthenticated(page: Page) {
  await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 20_000 });
}
