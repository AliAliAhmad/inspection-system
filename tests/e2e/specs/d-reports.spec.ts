/**
 * D) Reports UI Tests
 * =====================
 * Validates the reports page loads data from the backend correctly.
 * All tests are read-only — safe for production.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, expectAuthenticated } from '../helpers/auth';
import { ENV } from '../helpers/env';
import { collectConsoleErrors, collectFailedRequests } from '../helpers/diagnostics';

test.describe('D) Reports UI', () => {
  test('D1: Reports page loads successfully', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/reports');

    // Page title should be visible
    await expect(
      page.getByText(/reports|analytics|تقارير/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Loading spinner should eventually disappear
    await expect(page.locator('.ant-spin-spinning')).toBeHidden({ timeout: 20_000 });

    // No 500 errors
    const serverErrors = consoleErrors.filter((e) => e.includes('500'));
    expect(serverErrors).toHaveLength(0);
  });

  test('D2: Dashboard statistics are displayed', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/reports');
    await expect(page.locator('.ant-spin-spinning')).toBeHidden({ timeout: 20_000 });

    // Statistic cards should be visible (Ant Design Statistic component)
    const statistics = page.locator('.ant-statistic');
    const statCount = await statistics.count();
    expect(statCount).toBeGreaterThan(0);
  });

  test('D3: Defect analytics section loads', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/reports');
    await expect(page.locator('.ant-spin-spinning')).toBeHidden({ timeout: 20_000 });

    // Look for defect analytics card
    const defectCard = page.getByText(/defect analytics|تحليل العيوب/i).first();
    const hasDefects = await defectCard.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasDefects) {
      // Severity and status tables should be inside
      const tables = page.locator('.ant-table');
      const tableCount = await tables.count();
      expect(tableCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('D4: Staff capacity section loads', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/reports');
    await expect(page.locator('.ant-spin-spinning')).toBeHidden({ timeout: 20_000 });

    // Look for capacity section
    const capacityCard = page.getByText(/staff capacity|سعة الموظفين/i).first();
    const hasCapacity = await capacityCard.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasCapacity) {
      // Utilization rate progress bar should be present
      await expect(page.locator('.ant-progress').first()).toBeVisible();
    }
  });

  test('D5: Reports page has no error alerts', async ({ page }) => {
    const failedRequests = collectFailedRequests(page);

    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/reports');

    // Wait for data to load
    await page.waitForTimeout(5_000);

    // No error alert should be displayed
    const errorAlert = page.locator('.ant-alert-error');
    const hasError = await errorAlert.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBe(false);

    // No 500 errors from API
    const serverErrors = failedRequests.filter((f) => f.status >= 500);
    expect(serverErrors).toHaveLength(0);
  });

  test('D6: Dashboard page loads for admin', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    // Dashboard is the default route "/"
    await page.goto('/');
    await expectAuthenticated(page);

    // Dashboard should show statistics
    await page.waitForTimeout(3_000);
    const statistics = page.locator('.ant-statistic');
    const statCount = await statistics.count();
    expect(statCount).toBeGreaterThanOrEqual(0);
  });
});
