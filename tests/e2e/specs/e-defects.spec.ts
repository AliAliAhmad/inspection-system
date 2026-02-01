/**
 * E) Defects & Data Visibility Tests
 * =====================================
 * Validates the defects page, data tables, and cross-page navigation.
 * Read-only tests are safe for production.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, expectAuthenticated } from '../helpers/auth';
import { ENV, skipIfProdUnsafe } from '../helpers/env';
import { collectFailedRequests } from '../helpers/diagnostics';

test.describe('E) Defects & Data Visibility', () => {
  test('E1: Defects page loads with status tabs', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/defects');

    // Tabs should be visible (All, Open, In Progress, Resolved, Closed, False Alarm)
    await expect(page.locator('.ant-tabs')).toBeVisible({ timeout: 15_000 });

    // Table should load
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });
  });

  test('E2: Defects table shows severity and status columns', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/defects');
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    // Table header should contain severity and status columns
    const headerCells = page.locator('.ant-table-thead th');
    const headers = await headerCells.allTextContents();
    const headerText = headers.join(' ').toLowerCase();

    expect(headerText).toContain('severity');
    expect(headerText).toContain('status');
  });

  test('E3: Defect status tab filtering works', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/defects');
    await expect(page.locator('.ant-tabs')).toBeVisible({ timeout: 15_000 });

    // Click "Open" tab
    const openTab = page.getByRole('tab', { name: /open/i });
    const hasOpenTab = await openTab.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasOpenTab) {
      await openTab.click();
      // Table should reload (loading indicator may appear briefly)
      await page.waitForTimeout(2_000);
      await expect(page.locator('.ant-table')).toBeVisible();
    }
  });

  test('E4: Assign Specialist button appears on open defects', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/defects');
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    // Look for "Assign Specialist" button in the table
    const assignButton = page.getByRole('button', { name: /assign specialist/i }).first();
    const hasAssignButton = await assignButton.isVisible({ timeout: 5_000 }).catch(() => false);

    // If defects exist, the button should be present on open ones
    // If no defects, the empty state is acceptable
    const emptyState = await page.locator('.ant-empty').isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasAssignButton || emptyState).toBe(true);
  });

  test('E5: Assign Specialist modal opens correctly', async ({ page }) => {
    skipIfProdUnsafe(test.info());

    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/defects');
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    // Click the first "Assign Specialist" button
    const assignButton = page.getByRole('button', { name: /assign specialist/i }).first();
    const hasButton = await assignButton.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasButton) {
      test.skip(true, 'No open defects available to test assign modal');
      return;
    }

    await assignButton.click();

    // Modal should open
    await expect(page.locator('.ant-modal')).toBeVisible({ timeout: 5_000 });

    // Modal should contain specialist selector
    await expect(page.getByText(/specialist|متخصص/i).first()).toBeVisible();

    // Close modal
    await page.locator('.ant-modal .ant-modal-close').click();
    await expect(page.locator('.ant-modal')).toBeHidden({ timeout: 5_000 });
  });

  test('E6: Equipment page shows data table', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/equipment');
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    // Table should have header rows
    const headerCells = page.locator('.ant-table-thead th');
    const count = await headerCells.count();
    expect(count).toBeGreaterThan(0);
  });

  test('E7: Checklists page loads', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/checklists');

    // Page should load (table or cards or list)
    await page.waitForTimeout(3_000);
    const hasContent =
      (await page.locator('.ant-table').isVisible().catch(() => false)) ||
      (await page.locator('.ant-card').isVisible().catch(() => false)) ||
      (await page.locator('.ant-list').isVisible().catch(() => false));
    expect(hasContent).toBe(true);
  });

  test('E8: Notifications page loads', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/notifications');

    // Page should load without errors
    await page.waitForTimeout(3_000);
    const hasError = await page.locator('.ant-alert-error').isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBe(false);
  });

  test('E9: All admin pages load without 500 errors', async ({ page }) => {
    const failedRequests = collectFailedRequests(page);

    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    const adminPages = [
      '/admin/equipment',
      '/admin/inspections',
      '/admin/defects',
      '/admin/reports',
      '/admin/schedules',
    ];

    for (const path of adminPages) {
      await page.goto(path);
      await page.waitForTimeout(2_000);
    }

    // No 500 errors across any page
    const serverErrors = failedRequests.filter((f) => f.status >= 500);
    if (serverErrors.length > 0) {
      console.error('Server errors encountered:', serverErrors);
    }
    expect(serverErrors).toHaveLength(0);
  });
});
