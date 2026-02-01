/**
 * A) Authentication Tests
 * =========================
 * Validates real login flow through the UI and verifies session management.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, isOnLoginPage, expectAuthenticated } from '../helpers/auth';
import { ENV } from '../helpers/env';
import { collectConsoleErrors } from '../helpers/diagnostics';

test.describe('A) Authentication', () => {
  test('A1: Login page renders correctly', async ({ page }) => {
    await page.goto('/');

    // Login form should be visible with email and password inputs
    await expect(page.getByPlaceholder(/email/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /log\s*in|sign\s*in|تسجيل/i }),
    ).toBeVisible();
  });

  test('A2: Login succeeds with valid credentials (no loop, no blank screen)', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);

    // Verify we're on the main layout (not stuck on login)
    await expectAuthenticated(page);

    // Verify no login loop — the login form should NOT be visible
    const stillOnLogin = await isOnLoginPage(page);
    expect(stillOnLogin).toBe(false);

    // Verify token was stored
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(token).toBeTruthy();

    // No critical console errors related to auth
    const authErrors = errors.filter(
      (e) => e.includes('401') || e.includes('403') || e.includes('CORS'),
    );
    if (authErrors.length > 0) {
      console.warn('Auth-related console errors:', authErrors);
    }
  });

  test('A3: Login fails with invalid credentials', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder(/email/i)).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder(/email/i).fill('nonexistent@test.com');
    await page.getByPlaceholder(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /log\s*in|sign\s*in|تسجيل/i }).click();

    // Should show an error alert
    await expect(page.locator('.ant-alert-error')).toBeVisible({ timeout: 10_000 });

    // Should still be on the login page
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });

  test('A4: Protected pages redirect to login when unauthenticated', async ({ page }) => {
    // Clear any existing tokens
    await page.addInitScript(() => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    });

    await page.goto('/admin/equipment');

    // Should show login page, not the equipment page
    await expect(page.getByPlaceholder(/email/i)).toBeVisible({ timeout: 20_000 });
  });

  test('A5: Session persists after page reload', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    // Reload the page
    await page.reload();

    // Should still be authenticated (AuthProvider restores from localStorage + /api/auth/me)
    await expectAuthenticated(page);
  });

  test('A6: Language selector works on login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder(/email/i)).toBeVisible({ timeout: 20_000 });

    // Language selector should be visible
    const langSelect = page.locator('.ant-select').last();
    await expect(langSelect).toBeVisible();
  });
});
