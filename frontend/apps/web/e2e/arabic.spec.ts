import { test, expect } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';
import { ARABIC, switchToArabic } from './helpers/arabic.helper';

// ── Language & RTL tests ───────────────────────────────────────

test.describe('Arabic Language Support', () => {
  test('language selector shows Arabic option on login page', async ({ page }) => {
    await page.goto('/');
    const langSelect = page.locator('.ant-select');
    await expect(langSelect).toBeVisible();
    await langSelect.click();
    await expect(page.getByText('العربية')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/arabic-language-select.png' });
  });

  test('switching to Arabic changes lang selection display', async ({ page }) => {
    await page.goto('/');
    await switchToArabic(page);
    await expect(page.locator('.ant-select-selection-item')).toHaveText('العربية');
    await page.screenshot({ path: 'e2e/screenshots/arabic-switched.png' });
  });

  test('Arabic text can be typed into username field', async ({ page }) => {
    await page.goto('/');
    const field = page.getByPlaceholder(/email or username/i);
    await field.fill(ARABIC.test);
    await expect(field).toHaveValue(ARABIC.test);
    await page.screenshot({ path: 'e2e/screenshots/arabic-username-field.png' });
  });
});

// ── Arabic text in authenticated pages ────────────────────────

test.describe('Arabic in Authenticated Pages', () => {
  test.beforeEach(async ({ page }) => {
    // LIFO fix: catch-all first (lowest priority)
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], items: [], total: 0, notifications: [] }),
      }),
    );
    // Override AI-summary routes: return { data: null } so NotificationAISummary
    // renders nothing instead of crashing when it receives [] and calls [].pending_actions.filter()
    await page.route(
      (url) => url.pathname.includes('/notifications/ai/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      }),
    );
    // mockLoginAs last = highest LIFO priority for /api/auth/me
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('app home page loads without crash', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'e2e/screenshots/arabic-home.png' });
  });

  test('app launcher opens and shows items', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-header', { timeout: 20000 });
    await page.locator('.launcher-trigger').click();
    await expect(page.locator('.launcher-app-item').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/arabic-launcher.png' });
  });

  test('notifications page loads with Arabic-ready structure', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'e2e/screenshots/arabic-notifications.png' });
  });

  test('profile page loads (can switch language there)', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/profile/);
    await page.screenshot({ path: 'e2e/screenshots/arabic-profile.png' });
  });
});
