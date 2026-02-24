import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';
import { openLauncher } from './helpers/navigation.helper';

test.describe('Admin Role', () => {
  test.setTimeout(120000);

  test('admin can login and sees admin launcher items', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page.locator('.app-header')).toBeVisible();

    await openLauncher(page);

    // Admin sees "Users" (admin-only item)
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' }).first()
    ).toBeVisible({ timeout: 5000 });

    // Admin sees "Assignments"
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Assignments' }).first()
    ).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/admin-launcher.png' });
  });

  test('admin can access Users page', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/users/);
    await page.screenshot({ path: 'e2e/screenshots/admin-users.png' });
  });

  test('admin can access Equipment page', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/equipment');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/equipment/);
    await page.screenshot({ path: 'e2e/screenshots/admin-equipment.png' });
  });

  test('admin can access Schedules page', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/schedules');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/schedules/);
    await page.screenshot({ path: 'e2e/screenshots/admin-schedules.png' });
  });

  test('admin can access Reports page', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/reports');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/reports/);
    await page.screenshot({ path: 'e2e/screenshots/admin-reports.png' });
  });

  test('admin can access Approvals page', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/approvals');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/approvals/);
    await page.screenshot({ path: 'e2e/screenshots/admin-approvals.png' });
  });

  test('admin can access Work Planning page', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin/work-planning');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/work-planning/);
    await page.screenshot({ path: 'e2e/screenshots/admin-work-planning.png' });
  });
});
