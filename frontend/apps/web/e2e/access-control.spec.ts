import { test, expect, Page } from '@playwright/test';
import { mockLoginAs, MOCK_USERS, type MockUser } from './helpers/auth.helper';

// IMPORTANT: Register catch-all API mock BEFORE mockLoginAs.
// Playwright uses LIFO order — the last-registered handler fires first.
// mockLoginAs registers /api/auth/me; if catch-all is registered AFTER it,
// the catch-all fires first and returns empty data, breaking auth.
async function setupAs(page: Page, user: MockUser) {
  // 1. Catch-all registered FIRST (will be lower priority due to LIFO)
  await page.route((url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'), (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], items: [], total: 0 }),
    }),
  );
  // 2. mockLoginAs registered LAST → its /api/auth/me handler fires first (LIFO)
  await mockLoginAs(page, user);
}

// ── Role restriction tests (mock-based) ───────────────────────

test.describe('Inspector Cannot Access Admin Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupAs(page, MOCK_USERS.inspector);
  });

  test('inspector redirected from /admin/users', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL('/', { timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/acl-inspector-admin-users.png' });
  });

  test('inspector redirected from /admin/equipment', async ({ page }) => {
    await page.goto('/admin/equipment');
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('inspector redirected from /engineer/jobs', async ({ page }) => {
    await page.goto('/engineer/jobs');
    await page.waitForURL('/', { timeout: 10000 });
  });
});

test.describe('Specialist Cannot Access Admin/Engineer Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupAs(page, MOCK_USERS.specialist);
  });

  test('specialist redirected from /admin/users', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL('/', { timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/acl-specialist-admin.png' });
  });

  test('specialist redirected from /engineer/jobs', async ({ page }) => {
    await page.goto('/engineer/jobs');
    await page.waitForURL('/', { timeout: 10000 });
  });
});

test.describe('Engineer Cannot Access Admin-Only Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupAs(page, MOCK_USERS.engineer);
  });

  test('engineer redirected from /admin/users', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForURL('/', { timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/acl-engineer-admin.png' });
  });

  test('engineer CAN access /admin/work-planning (shared with admin)', async ({ page }) => {
    await page.goto('/admin/work-planning');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/admin\/work-planning/);
    await page.screenshot({ path: 'e2e/screenshots/acl-engineer-work-planning.png' });
  });
});

test.describe('Launcher Shows Correct Items Per Role', () => {
  test('admin sees Users in launcher', async ({ page }) => {
    await setupAs(page, MOCK_USERS.admin);
    await page.goto('/');
    await page.waitForSelector('.app-header', { timeout: 20000 });
    await page.locator('.launcher-trigger').click();
    await page.waitForSelector('.launcher-app-item', { timeout: 5000 });
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' }).first()
    ).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/acl-admin-launcher.png' });
  });

  test('inspector does not see Users in launcher', async ({ page }) => {
    await setupAs(page, MOCK_USERS.inspector);
    await page.goto('/');
    await page.waitForSelector('.app-header', { timeout: 20000 });
    await page.locator('.launcher-trigger').click();
    await page.waitForSelector('.launcher-app-item', { timeout: 5000 });
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' })
    ).toHaveCount(0);
    await page.screenshot({ path: 'e2e/screenshots/acl-inspector-launcher.png' });
  });
});
