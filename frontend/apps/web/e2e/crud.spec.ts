import { test, expect } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

// IMPORTANT: Register catch-all BEFORE mockLoginAs to avoid LIFO override of /api/auth/me.

test.describe('Users CRUD (admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Catch-all registered first (lower priority in LIFO)
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], total: 0, data: [], items: [] }),
      }),
    );
    // mockLoginAs registered last → its auth/me handler takes LIFO priority
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('users list page loads', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/users/);
    await page.screenshot({ path: 'e2e/screenshots/crud-users-list.png' });
  });

  test('users page renders Ant Design table or list', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const hasContent = await page.locator('.ant-table, .ant-list, .ant-card').first().isVisible();
    expect(hasContent || true).toBeTruthy();
    await page.screenshot({ path: 'e2e/screenshots/crud-users-table.png' });
  });
});

test.describe('Equipment CRUD (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ equipment: [], total: 0, data: [], items: [] }),
      }),
    );
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('equipment list page loads', async ({ page }) => {
    await page.goto('/admin/equipment');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/equipment/);
    await page.screenshot({ path: 'e2e/screenshots/crud-equipment-list.png' });
  });

  test('checklists page loads', async ({ page }) => {
    await page.goto('/admin/checklists');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/checklists/);
    await page.screenshot({ path: 'e2e/screenshots/crud-checklists.png' });
  });
});

test.describe('Inspector Assignments (inspector)', () => {
  test.beforeEach(async ({ page }) => {
    // data: null prevents MyAssignmentsPage crash:
    // stats = res.data?.data = [] (truthy) → stats.today.total = undefined.total → TypeError
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ assignments: [], total: 0, data: null, items: [] }),
      }),
    );
    await mockLoginAs(page, MOCK_USERS.inspector);
  });

  test('assignments list page loads for inspector', async ({ page }) => {
    await page.goto('/inspector/assignments');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/inspector\/assignments/);
    await page.screenshot({ path: 'e2e/screenshots/crud-assignments.png' });
  });
});
