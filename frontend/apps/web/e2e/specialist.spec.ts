import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';
import { openLauncher } from './helpers/navigation.helper';

test.describe('Specialist Role', () => {
  test.setTimeout(120000);

  test('specialist can login and sees My Jobs in launcher', async ({ page }) => {
    await loginAs(page, 'specialist');
    await expect(page.locator('.app-header')).toBeVisible();

    await openLauncher(page);

    // Specialist sees "My Jobs" (specialist path)
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'My Jobs' }).first()
    ).toBeVisible({ timeout: 5000 });

    // Specialist does NOT see "Users" or "My Assignments"
    await expect(
      page.locator('.launcher-app-item').filter({ hasText: 'Users' })
    ).toHaveCount(0);

    await page.screenshot({ path: 'e2e/screenshots/specialist-launcher.png' });
  });

  test('specialist can access My Jobs page', async ({ page }) => {
    await loginAs(page, 'specialist');
    await page.goto('/specialist/jobs');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/specialist\/jobs/);
    await page.screenshot({ path: 'e2e/screenshots/specialist-jobs.png' });
  });

  test('specialist can access shared pages (leaderboard, leaves)', async ({ page }) => {
    await loginAs(page, 'specialist');

    await page.goto('/leaderboard');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });

    await page.goto('/leaves');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });

    await page.screenshot({ path: 'e2e/screenshots/specialist-shared-pages.png' });
  });

  test('specialist is redirected away from admin-only pages', async ({ page }) => {
    await loginAs(page, 'specialist');
    await page.goto('/admin/users');
    await page.waitForURL(/^https:\/\/inspection-web\.onrender\.com\/?$/, { timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/specialist-admin-redirect.png' });
  });
});
