import { test, expect } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

// Quality Engineer routes:
//   /quality/reviews        → My Reviews (PendingReviewsPage + QualityReviewsPage)
//   /quality/overdue        → Overdue Reviews
//   /quality/bonus-requests → Bonus Requests
// QE is NOT an admin — cannot access /admin/users, /engineer/jobs, etc.

test.describe('Quality Engineer Role', () => {
  test.beforeEach(async ({ page }) => {
    // LIFO: catch-all first (lowest priority).
    // data: null prevents any component that does response.data?.data from crashing
    // when it receives a truthy empty array.
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, items: [], total: 0 }),
        }),
    );
    // mockLoginAs last = highest LIFO priority for /api/auth/me
    await mockLoginAs(page, MOCK_USERS.qe);
  });

  // ── Launcher ───────────────────────────────────────────────────────

  test('QE sees My Reviews in launcher but not admin-only items', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    await page.locator('.launcher-trigger').click();

    // QE-specific launcher item
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'My Reviews' }).first(),
    ).toBeVisible({ timeout: 5000 });

    // Admin-only item must NOT appear for QE
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' }),
    ).toHaveCount(0);

    await page.screenshot({ path: 'e2e/screenshots/qe-launcher.png' });
  });

  // ── QE-specific pages ──────────────────────────────────────────────

  test('QE can access My Reviews page', async ({ page }) => {
    await page.goto('/quality/reviews');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/quality\/reviews/);
    await page.screenshot({ path: 'e2e/screenshots/qe-reviews.png' });
  });

  test('My Reviews page shows an Ant Design table', async ({ page }) => {
    await page.goto('/quality/reviews');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    // Table always renders even when empty
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/qe-reviews-table.png' });
  });

  test('QE can access Overdue Reviews page', async ({ page }) => {
    await page.goto('/quality/overdue');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/quality\/overdue/);
    await page.screenshot({ path: 'e2e/screenshots/qe-overdue.png' });
  });

  test('QE can access Bonus Requests page', async ({ page }) => {
    await page.goto('/quality/bonus-requests');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/quality\/bonus-requests/);
    await page.screenshot({ path: 'e2e/screenshots/qe-bonus.png' });
  });

  // ── Access control ─────────────────────────────────────────────────

  test('QE is redirected away from admin-only Users page', async ({ page }) => {
    await page.goto('/admin/users');
    // RoleGuard redirects non-admin roles to home
    await page.waitForURL('/', { timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/qe-admin-redirect.png' });
  });

  test('QE is redirected away from engineer-only Jobs page', async ({ page }) => {
    await page.goto('/engineer/jobs');
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('QE is redirected away from inspector-only Assignments page', async ({ page }) => {
    await page.goto('/inspector/assignments');
    await page.waitForURL('/', { timeout: 10000 });
  });

  // ── Shared pages available to QE ──────────────────────────────────

  test('QE can access profile page', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/profile/);
    await page.screenshot({ path: 'e2e/screenshots/qe-profile.png' });
  });

  test('QE can access leaderboard page', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/leaderboard/);
    await page.screenshot({ path: 'e2e/screenshots/qe-leaderboard.png' });
  });

  test('QE can access notifications page', async ({ page }) => {
    // Extra mock for the AI summary endpoint so NotificationAISummary doesn't crash
    await page.route(
      (url) => url.pathname.includes('/notifications/ai/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null }),
        }),
    );
    await page.goto('/notifications');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/notifications/);
    await page.screenshot({ path: 'e2e/screenshots/qe-notifications.png' });
  });
});
