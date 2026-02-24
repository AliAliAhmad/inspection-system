import { test, expect } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

// ── Catch-all mock helper ────────────────────────────────────────────────────
// Without this, unrouted API calls hit production. React Query retries on
// errors with exponential back-off, which causes timeouts well beyond 10s.

async function setupMocks(page: Parameters<typeof mockLoginAs>[0], role: keyof typeof MOCK_USERS) {
  // LIFO: catch-all first (lowest priority)
  await page.route(
    (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, items: [], total: 0, notifications: [] }),
      }),
  );
  // mockLoginAs last = highest LIFO priority for /api/auth/me
  await mockLoginAs(page, MOCK_USERS[role]);
}

test.describe('Sidebar Navigation', () => {
  test('admin sees admin menu items in sidebar', async ({ page }) => {
    await setupMocks(page, 'admin');
    await page.goto('/');

    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // The app uses an App Launcher popup (no sidebar). Open it to render role-filtered items.
    await page.locator('.launcher-trigger').click();

    // Items render as .launcher-app-item divs (no href) — check by visible label text.
    // "Users" is an admin-only item in the Team category.
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('inspector sees only inspector menu items', async ({ page }) => {
    await setupMocks(page, 'inspector');
    await page.goto('/');

    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Open App Launcher to render role-filtered items
    await page.locator('.launcher-trigger').click();

    // Inspector should see "My Assignments" (inspector-only label)
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'My Assignments' }).first()
    ).toBeVisible({ timeout: 5000 });

    // Inspector should NOT see "Users" (admin-only)
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' })
    ).toHaveCount(0);
  });

  test('engineer sees engineer-specific menu items', async ({ page }) => {
    await setupMocks(page, 'engineer');
    await page.goto('/');

    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Open App Launcher to render role-filtered items
    await page.locator('.launcher-trigger').click();

    // Engineer should see "My Jobs" (engineer-only label)
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'My Jobs' }).first()
    ).toBeVisible({ timeout: 5000 });

    // Engineer should NOT see "Users" (admin-only) or "My Assignments" (inspector-only)
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' })
    ).toHaveCount(0);
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'My Assignments' })
    ).toHaveCount(0);
  });
});

test.describe('Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, 'inspector');
  });

  test('navigates from dashboard to notifications', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Navigate directly — no persistent sidebar in this layout
    await page.goto('/notifications');

    await expect(page).toHaveURL(/\/notifications/);
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
  });

  test('navigates from dashboard to leaderboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Navigate directly — no persistent sidebar in this layout
    await page.goto('/leaderboard');

    await expect(page).toHaveURL(/\/leaderboard/);
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Logout', () => {
  test('logout clears session and shows login page', async ({ page }) => {
    await setupMocks(page, 'inspector');

    // Mock logout endpoint
    await page.route('**/api/auth/logout', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto('/');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Click on the avatar/name Space in the header (same pattern as auth.helper logout)
    await page.locator('.app-header').locator('.ant-space').last().click();

    // Wait for the Ant Design dropdown menu to be fully open before clicking.
    const logoutItem = page.locator('.ant-dropdown-menu-item').filter({ hasText: /log\s*out/i });
    await expect(logoutItem).toBeVisible({ timeout: 8000 });
    await logoutItem.click();

    // Should return to the login page
    await expect(page.getByPlaceholder(/username/i)).toBeVisible({ timeout: 10000 });

    // localStorage tokens should be cleared
    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(accessToken).toBeNull();
  });
});
