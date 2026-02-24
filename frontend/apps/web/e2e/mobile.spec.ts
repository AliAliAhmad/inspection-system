import { test, expect } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

// Mobile tests run on iPhone 13 viewport via playwright.config.ts Mobile Safari project.

test.describe('Mobile Viewport', () => {
  test('login page renders correctly on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder(/email or username/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log\s*in|sign\s*in/i })).toBeVisible();

    // No horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 20); // 20px tolerance

    await page.screenshot({ path: 'e2e/screenshots/mobile-login.png' });
  });

  test('login form is usable on mobile viewport', async ({ page }) => {
    await page.goto('/');
    const usernameField = page.getByPlaceholder(/email or username/i);
    const passwordField = page.getByPlaceholder(/password/i);
    const submitBtn = page.getByRole('button', { name: /log\s*in|sign\s*in/i });

    // All form elements should be within viewport
    await expect(usernameField).toBeInViewport();
    await expect(passwordField).toBeInViewport();
    await expect(submitBtn).toBeInViewport();

    await page.screenshot({ path: 'e2e/screenshots/mobile-login-form.png' });
  });

  test('authenticated app renders header on mobile', async ({ page }) => {
    await mockLoginAs(page, MOCK_USERS.admin);
    await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], items: [], total: 0 }),
      }),
    );
    await page.goto('/');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'e2e/screenshots/mobile-dashboard.png' });
  });

  test('dashboard page has no horizontal scroll on mobile', async ({ page }) => {
    await mockLoginAs(page, MOCK_USERS.inspector);
    await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], items: [], total: 0 }),
      }),
    );
    await page.goto('/dashboard');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 30);
    await page.screenshot({ path: 'e2e/screenshots/mobile-no-scroll.png' });
  });

  test('language selector is visible and usable on mobile', async ({ page }) => {
    await page.goto('/');
    const langSelect = page.locator('.ant-select');
    await expect(langSelect).toBeVisible();
    await expect(langSelect).toBeInViewport();
    await page.screenshot({ path: 'e2e/screenshots/mobile-lang-select.png' });
  });
});
