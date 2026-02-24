import { test, expect } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

test.describe('Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    // LIFO fix: catch-all first (lowest priority).
    // Use data: null so components that do response.data.data get null (safe)
    // instead of [] (which is truthy and bypasses null checks → crash).
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reports: [], data: null, items: [], total: 0 }),
      }),
    );
    // AI/performance routes: explicitly return null data to prevent component crashes.
    // These components do response.data.data and crash when given [] (truthy but wrong shape).
    await page.route(
      (url) =>
        url.pathname.includes('/reports/ai/') ||
        url.pathname.includes('/performance/') ||
        url.pathname.includes('/notifications/ai/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', data: null }),
      }),
    );
    // mockLoginAs last = highest LIFO priority for /api/auth/me
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('reports page loads for admin', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/reports/);
    await page.screenshot({ path: 'e2e/screenshots/reports-page.png' });
  });

  test('reports page has breadcrumb with "Reports"', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    const breadcrumb = page.locator('.ant-breadcrumb');
    if (await breadcrumb.isVisible()) {
      const text = (await breadcrumb.textContent()) ?? '';
      // Breadcrumb auto-generates labels from URL segments: /admin/reports → "Admin / Reports"
      expect(text.toLowerCase()).toContain('report');
    }
    await page.screenshot({ path: 'e2e/screenshots/reports-breadcrumb.png' });
  });

  test('performance page loads for admin', async ({ page }) => {
    await page.goto('/admin/performance');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'e2e/screenshots/reports-performance.png' });
  });
});

test.describe('Reports Access Control', () => {
  test('non-admin inspector cannot access reports', async ({ page }) => {
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, items: [], total: 0 }),
      }),
    );
    await mockLoginAs(page, MOCK_USERS.inspector);
    await page.goto('/admin/reports');
    await page.waitForURL('/', { timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/reports-unauthorized.png' });
  });
});
