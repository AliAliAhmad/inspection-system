import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';
import { openLauncher } from './helpers/navigation.helper';

test.describe('Inspector Role', () => {
  test.setTimeout(120000);

  test('inspector can login and sees My Assignments in launcher', async ({ page }) => {
    await loginAs(page, 'inspector');
    await expect(page.locator('.app-header')).toBeVisible();

    await openLauncher(page);

    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'My Assignments' }).first()
    ).toBeVisible({ timeout: 5000 });

    // Inspector does NOT see admin-only items
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' })
    ).toHaveCount(0);

    await page.screenshot({ path: 'e2e/screenshots/inspector-launcher.png' });
  });

  test('inspector can access My Assignments page', async ({ page }) => {
    await loginAs(page, 'inspector');
    await page.goto('/inspector/assignments');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/inspector\/assignments/);
    await page.screenshot({ path: 'e2e/screenshots/inspector-assignments.png' });
  });

  test('inspector can access shared pages (dashboard, leaderboard)', async ({ page }) => {
    await loginAs(page, 'inspector');

    await page.goto('/dashboard');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/leaderboard');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/leaderboard/);

    await page.screenshot({ path: 'e2e/screenshots/inspector-shared-pages.png' });
  });

  test('inspector is redirected away from admin-only pages', async ({ page }) => {
    await loginAs(page, 'inspector');
    await page.goto('/admin/users');
    await page.waitForURL(/^https:\/\/inspection-web\.onrender\.com\/?$/, { timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/inspector-admin-redirect.png' });
  });

  test('inspector is redirected away from engineer pages', async ({ page }) => {
    await loginAs(page, 'inspector');
    await page.goto('/engineer/jobs');
    await page.waitForURL(/^https:\/\/inspection-web\.onrender\.com\/?$/, { timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/inspector-engineer-redirect.png' });
  });

  test('inspector can access profile page', async ({ page }) => {
    await loginAs(page, 'inspector');
    await page.goto('/profile');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/profile/);
    await page.screenshot({ path: 'e2e/screenshots/inspector-profile.png' });
  });
});
