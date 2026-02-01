/**
 * F) GOLDEN PATH — Frontend UI Element Compliance
 * ==================================================
 * Verifies the UI contains ALL required elements in the inspection flow.
 * Maps directly to ACCEPTANCE_SCENARIOS.md steps.
 *
 * Each assertion checks that the required UI element EXISTS and is VISIBLE.
 * This test does NOT modify behavior — it only verifies presence.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, expectAuthenticated } from '../helpers/auth';
import { ENV, skipIfProdUnsafe } from '../helpers/env';

test.describe('F) Golden Path — UI Element Compliance', () => {

  // ================================================================
  // STEP 1: Login Page Elements
  // ================================================================
  test('GP-01: Login page has all required elements', async ({ page }) => {
    await page.goto('/');

    // Email input field
    const emailInput = page.getByPlaceholder(/email/i);
    await expect(emailInput).toBeVisible({ timeout: 20_000 });
    await expect(emailInput).toBeEditable();

    // Password input field
    const passwordInput = page.getByPlaceholder(/password/i);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeEditable();

    // Login button
    const loginButton = page.getByRole('button', { name: /log\s*in|sign\s*in|تسجيل/i });
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toBeEnabled();

    // Language selector
    await expect(page.locator('.ant-select').last()).toBeVisible();
  });

  // ================================================================
  // STEP 3: Equipment List UI
  // ================================================================
  test('GP-02: Equipment list page has required UI elements', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/equipment');

    // Table element
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    // Table headers must include key columns
    const headers = page.locator('.ant-table-thead th');
    await expect(headers.first()).toBeVisible();

    // Pagination (if data exists)
    const hasPagination = await page.locator('.ant-pagination').isVisible().catch(() => false);
    const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
    // Either data with pagination, or empty state — both valid
    expect(hasPagination || hasEmpty || (await headers.count()) > 0).toBe(true);
  });

  // ================================================================
  // STEP 4: Inspector Assignments — Start Button
  // ================================================================
  test('GP-03: Inspector assignments page has status tabs and action buttons', async ({ page }) => {
    await loginViaUI(page, ENV.INSPECTOR_EMAIL, ENV.INSPECTOR_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/inspector/assignments');

    // Table
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    // Status filter tabs (All, Assigned, In Progress, Completed)
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);

    // Action buttons: Start, Continue, or View Assessment
    // At least the table action column should exist
    const actionHeaders = page.locator('.ant-table-thead th');
    const headerTexts = await actionHeaders.allTextContents();
    const hasActionColumn = headerTexts.some(
      (h) => h.toLowerCase().includes('action') || h === '',
    );
    expect(hasActionColumn).toBe(true);
  });

  // ================================================================
  // STEP 5-9: Inspection Checklist — Progress + Answer Controls
  // ================================================================
  test('GP-04: Inspection checklist has progress indicator and answer controls', async ({ page }) => {
    skipIfProdUnsafe(test.info());

    await loginViaUI(page, ENV.INSPECTOR_EMAIL, ENV.INSPECTOR_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/inspector/assignments');
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    // Find any actionable assignment
    const startBtn = page.getByRole('button', { name: /start/i }).first();
    const continueBtn = page.getByRole('button', { name: /continue|details/i }).first();

    const hasStart = await startBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasContinue = await continueBtn.isVisible({ timeout: 2_000 }).catch(() => false);

    if (!hasStart && !hasContinue) {
      test.skip(true, 'No assignments available — cannot verify checklist UI');
      return;
    }

    // Navigate to checklist
    if (hasStart) await startBtn.click();
    else await continueBtn.click();

    await expect(page).toHaveURL(/\/inspector\/inspection\/\d+/, { timeout: 10_000 });

    // PROGRESS INDICATOR — must exist
    const progressBar = page.locator('.ant-progress');
    await expect(progressBar).toBeVisible({ timeout: 15_000 });

    // PROGRESS TEXT — shows "X / Y" format
    const progressText = page.locator('.ant-progress-text');
    if (await progressText.isVisible().catch(() => false)) {
      const text = await progressText.textContent();
      expect(text).toMatch(/\d+\s*\/\s*\d+/);
    }

    // BACK BUTTON
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible();

    // CHECKLIST ITEM CARDS — at least one
    const itemCards = page.locator('.ant-card');
    const cardCount = await itemCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // ANSWER CONTROLS — radio buttons (Pass/Fail or Yes/No) or text areas
    const radioGroups = page.locator('.ant-radio-group');
    const textAreas = page.locator('textarea');
    const hasAnswerControls =
      (await radioGroups.count()) > 0 || (await textAreas.count()) > 0;
    expect(hasAnswerControls).toBe(true);

    // SUBMIT BUTTON — exists (may be disabled if not all answered)
    const submitButton = page.locator('button').filter({ hasText: /submit|إرسال/i });
    await expect(submitButton.first()).toBeVisible();

    // COMMENT BUTTON — exists on at least one item
    const commentLinks = page.getByText(/comment|تعليق/i);
    const hasComments = await commentLinks.first().isVisible().catch(() => false);
    expect(hasComments).toBe(true);

    // PHOTO BUTTON — exists on at least one item
    const photoButtons = page.getByText(/photo|صورة/i);
    const hasPhoto = await photoButtons.first().isVisible().catch(() => false);
    expect(hasPhoto).toBe(true);
  });

  // ================================================================
  // STEP 7: Required-field validation (critical failure needs photo)
  // ================================================================
  test('GP-05: Critical failure validation is enforced in UI', async ({ page }) => {
    skipIfProdUnsafe(test.info());

    await loginViaUI(page, ENV.INSPECTOR_EMAIL, ENV.INSPECTOR_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/inspector/assignments');
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15_000 });

    const startBtn = page.getByRole('button', { name: /start/i }).first();
    const continueBtn = page.getByRole('button', { name: /continue|details/i }).first();

    const hasStart = await startBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasContinue = await continueBtn.isVisible({ timeout: 2_000 }).catch(() => false);

    if (!hasStart && !hasContinue) {
      test.skip(true, 'No assignments available — cannot verify validation');
      return;
    }

    if (hasStart) await startBtn.click();
    else await continueBtn.click();

    await expect(page).toHaveURL(/\/inspector\/inspection\/\d+/, { timeout: 10_000 });
    await expect(page.locator('.ant-progress')).toBeVisible({ timeout: 15_000 });

    // Look for critical indicator (red star badge)
    const criticalBadge = page.locator('.anticon-star');
    const hasCritical = await criticalBadge.first().isVisible({ timeout: 3_000 }).catch(() => false);

    // If critical items exist, clicking "Fail" without photo should show error
    if (hasCritical) {
      const failButton = page
        .locator('.ant-radio-button-wrapper')
        .filter({ hasText: /^fail$/i })
        .first();

      if (await failButton.isVisible().catch(() => false)) {
        await failButton.click();
        await page.waitForTimeout(2_000);

        // Error message should appear (from backend rejecting without photo)
        const hasError = await page.locator('.ant-message-error').isVisible({ timeout: 3_000 }).catch(() => false);
        // Error is expected — this validates the constraint is enforced
        expect(hasError).toBe(true);
      }
    }
  });

  // ================================================================
  // STEP 12: Defect Visibility UI
  // ================================================================
  test('GP-06: Defects page shows required columns and status tabs', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/defects');

    // Status tabs
    const tabs = page.locator('.ant-tabs');
    await expect(tabs).toBeVisible({ timeout: 15_000 });

    // Tab items should include: All, Open, In Progress, Resolved, Closed
    const tabItems = page.locator('.ant-tabs-tab');
    const tabCount = await tabItems.count();
    expect(tabCount).toBeGreaterThanOrEqual(4);

    // Table
    await expect(page.locator('.ant-table')).toBeVisible();

    // Required columns: Severity, Status
    const headers = await page.locator('.ant-table-thead th').allTextContents();
    const headerText = headers.join(' ').toLowerCase();
    expect(headerText).toContain('severity');
    expect(headerText).toContain('status');

    // Action column with Assign Specialist button (if defects exist)
    const assignButton = page.getByRole('button', { name: /assign specialist|assigned/i }).first();
    const emptyState = page.locator('.ant-empty');
    const hasAssign = await assignButton.isVisible({ timeout: 3_000 }).catch(() => false);
    const isEmpty = await emptyState.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasAssign || isEmpty).toBe(true);
  });

  // ================================================================
  // STEP 17: Reports Page Renders Results
  // ================================================================
  test('GP-07: Reports page renders all required sections', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    await page.goto('/admin/reports');

    // Wait for loading to finish
    await expect(page.locator('.ant-spin-spinning')).toBeHidden({ timeout: 20_000 });

    // Page title
    await expect(
      page.getByText(/reports|analytics|تقارير/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Statistics cards (Ant Design Statistic)
    const statistics = page.locator('.ant-statistic');
    const statCount = await statistics.count();
    expect(statCount).toBeGreaterThan(0);

    // Defect analytics section (if data exists)
    const defectSection = page.getByText(/defect analytics|تحليل العيوب/i).first();
    const hasDefects = await defectSection.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasDefects) {
      // Should have tables for severity/status breakdown
      const tables = page.locator('.ant-table');
      expect(await tables.count()).toBeGreaterThanOrEqual(1);
    }

    // Capacity section (if data exists)
    const capacitySection = page.getByText(/staff capacity|سعة/i).first();
    const hasCapacity = await capacitySection.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasCapacity) {
      // Utilization progress bar
      await expect(page.locator('.ant-progress').first()).toBeVisible();
    }

    // No error alerts
    const hasError = await page.locator('.ant-alert-error').isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBe(false);
  });

  // ================================================================
  // NAVIGATION: All critical pages accessible
  // ================================================================
  test('GP-08: All critical admin pages are navigable', async ({ page }) => {
    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    const criticalPages = [
      { path: '/admin/equipment', name: 'Equipment' },
      { path: '/admin/inspections', name: 'All Inspections' },
      { path: '/admin/defects', name: 'Defects' },
      { path: '/admin/reports', name: 'Reports' },
    ];

    for (const pg of criticalPages) {
      await page.goto(pg.path);
      // Page should load without error
      await page.waitForTimeout(2_000);
      const hasError = await page.locator('.ant-alert-error').isVisible({ timeout: 2_000 }).catch(() => false);
      expect(hasError).toBe(false);
    }
  });
});
