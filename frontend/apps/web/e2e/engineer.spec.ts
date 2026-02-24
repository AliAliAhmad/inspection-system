import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';
import { openLauncher } from './helpers/navigation.helper';

test.describe('Engineer Role', () => {
  test.setTimeout(120000);

  test('engineer can login and sees engineer launcher items', async ({ page }) => {
    await loginAs(page, 'engineer');
    await expect(page.locator('.app-header')).toBeVisible();

    await openLauncher(page);

    // Engineer sees "My Jobs"
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'My Jobs' }).first()
    ).toBeVisible({ timeout: 5000 });

    // Engineer does NOT see "Users" (admin-only)
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' })
    ).toHaveCount(0);

    await page.screenshot({ path: 'e2e/screenshots/engineer-launcher.png' });
  });

  test('engineer can access My Jobs page', async ({ page }) => {
    await loginAs(page, 'engineer');
    await page.goto('/engineer/jobs');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/engineer\/jobs/);
    await page.screenshot({ path: 'e2e/screenshots/engineer-jobs.png' });
  });

  test('engineer can access Pause Approvals page', async ({ page }) => {
    await loginAs(page, 'engineer');
    await page.goto('/engineer/pause-approvals');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/engineer\/pause-approvals/);
    await page.screenshot({ path: 'e2e/screenshots/engineer-pause-approvals.png' });
  });

  test('engineer can access Team Assignment page', async ({ page }) => {
    await loginAs(page, 'engineer');
    await page.goto('/engineer/team-assignment');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/engineer\/team-assignment/);
    await page.screenshot({ path: 'e2e/screenshots/engineer-team-assignment.png' });
  });

  test('engineer can access Work Planning (shared with admin)', async ({ page }) => {
    await loginAs(page, 'engineer');
    await page.goto('/admin/work-planning');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/admin\/work-planning/);
    await page.screenshot({ path: 'e2e/screenshots/engineer-work-planning.png' });
  });

  test('engineer is redirected away from admin-only Users page', async ({ page }) => {
    await loginAs(page, 'engineer');
    await page.goto('/admin/users');
    // RoleGuard redirects to "/" for unauthorized access
    await page.waitForURL(/^https:\/\/inspection-web\.onrender\.com\/?$/, { timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/engineer-admin-redirect.png' });
  });
});
