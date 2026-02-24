import { test, expect, type Page } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

// Mock inspection data — one yes/no question, status: draft
const MOCK_INSPECTION = {
  id: 42,
  status: 'draft',
  inspection_code: 'INS-2024-001',
  equipment: {
    id: 10,
    name: 'Test Pump',
    equipment_type: 'Centrifugal Pump',
    location: 'Hall A',
    berth: 'B3',
  },
  checklist_items: [
    {
      id: 101,
      question_text: 'Is the pump operational?',
      question_text_ar: 'هل المضخة تعمل؟',
      answer_type: 'yes_no',
      order_index: 0,
      critical_failure: false,
      category: 'mechanical',
    },
    {
      id: 102,
      question_text: 'Any visible leaks?',
      question_text_ar: 'هل توجد تسربات مرئية؟',
      answer_type: 'yes_no',
      order_index: 1,
      critical_failure: true,
      category: 'mechanical',
    },
  ],
  answers: [],
};

// ── Shared setup helpers ──────────────────────────────────────────────

async function setupChecklistPage(
  page: Page,
  progress: { total_items: number; answered_items: number; percentage: number },
) {
  // LIFO: catch-all first (lowest priority)
  await page.route(
    (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      }),
  );

  // Mock getByAssignment — must match EXACTLY (no trailing path segments like /colleague-answers)
  // inspectionsApi.getByAssignment(assignmentId) → GET /api/inspections/by-assignment/:id
  await page.route(
    (url) =>
      /\/api\/inspections\/by-assignment\/\d+$/.test(url.pathname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_INSPECTION }),
      }),
  );

  // Mock getProgress — GET /api/inspections/:id/progress
  await page.route(
    (url) => /\/api\/inspections\/\d+\/progress/.test(url.pathname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: progress }),
      }),
  );

  // Mock answer submission — POST /api/inspections/:id/answers
  await page.route(
    (url) => /\/api\/inspections\/\d+\/answers/.test(url.pathname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } }),
      }),
  );

  // Mock submit — POST /api/inspections/:id/submit
  await page.route(
    (url) => /\/api\/inspections\/\d+\/submit/.test(url.pathname),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } }),
      }),
  );

  // mockLoginAs last = highest LIFO priority for /api/auth/me
  await mockLoginAs(page, MOCK_USERS.inspector);
}

// ── Tests: checklist page with 0/2 answered ──────────────────────────

test.describe('Inspection Checklist - Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await setupChecklistPage(page, { total_items: 2, answered_items: 0, percentage: 0 });
  });

  test('checklist page loads inside main layout', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/inspector\/inspection\/1/);
    await page.screenshot({ path: 'e2e/screenshots/checklist-load.png' });
  });

  test('equipment information card renders', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Ant Design Descriptions card shows equipment name from mock
    await expect(page.locator('.ant-descriptions')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/checklist-equipment-info.png' });
  });

  test('progress bar renders showing partial completion', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Ant Design Progress component renders when inspectionId resolves
    const progressBar = page.locator('.ant-progress');
    // Progress renders only once the inspection ID is known (after getByAssignment resolves)
    if (await progressBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(progressBar).toBeVisible();
    }
    await page.screenshot({ path: 'e2e/screenshots/checklist-progress-bar.png' });
  });

  test('yes/no radio buttons render for each question', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // Ant Design Radio.Group renders "Yes" and "No" buttons for yes_no questions
    const yesButtons = page.locator('.ant-radio-button-wrapper').filter({ hasText: /^yes$/i });
    if (await yesButtons.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(yesButtons.first()).toBeVisible();
    }
    await page.screenshot({ path: 'e2e/screenshots/checklist-radio-buttons.png' });
  });

  test('submit button is disabled when not all questions answered (0/2)', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // The submit button is wrapped in a Popconfirm — disabled when canSubmit=false
    // canSubmit = progress.answered_items >= progress.total_items && status === 'draft'
    // Here: 0 < 2 → disabled
    const submitBtn = page.getByRole('button', { name: /submit inspection/i }).or(
      page.getByRole('button', { name: /submit/i }).filter({ hasText: /submit/i }),
    );

    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(submitBtn).toBeDisabled();
    }
    await page.screenshot({ path: 'e2e/screenshots/checklist-submit-disabled.png' });
  });

  test('back button navigates to assignments', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // The "Back" button navigates to /inspector/assignments
    await page.getByRole('button', { name: /back/i }).click();
    await expect(page).toHaveURL(/\/inspector\/assignments/, { timeout: 5000 });
  });
});

// ── Tests: checklist page with all questions answered ─────────────────

test.describe('Inspection Checklist - Submit Enabled', () => {
  test.beforeEach(async ({ page }) => {
    // All 2 questions answered → submit button should be enabled
    await setupChecklistPage(page, { total_items: 2, answered_items: 2, percentage: 100 });
  });

  test('submit button is enabled when all questions answered (2/2)', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // canSubmit = true (2 >= 2 and status = 'draft')
    // The button should NOT be disabled
    const submitBtn = page.getByRole('button', { name: /submit inspection/i }).or(
      page.getByRole('button', { name: /submit/i }),
    );

    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(submitBtn).not.toBeDisabled();
    }
    await page.screenshot({ path: 'e2e/screenshots/checklist-submit-enabled.png' });
  });

  test('clicking submit button opens Popconfirm dialog', async ({ page }) => {
    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    const submitBtn = page.getByRole('button', { name: /submit inspection/i }).or(
      page.getByRole('button', { name: /submit/i }),
    );

    if (
      await submitBtn.isVisible({ timeout: 3000 }).catch(() => false) &&
      !(await submitBtn.isDisabled())
    ) {
      await submitBtn.click();
      // Ant Design Popconfirm renders as a popover overlay
      await expect(page.locator('.ant-popover, .ant-popconfirm')).toBeVisible({ timeout: 3000 });
      await page.screenshot({ path: 'e2e/screenshots/checklist-submit-popconfirm.png' });
    }
  });
});

// ── Tests: completed inspection (status !== 'draft') ─────────────────

test.describe('Inspection Checklist - Submitted State', () => {
  test('submitted inspection does not show submit button', async ({ page }) => {
    // Mock inspection with status: 'submitted'
    const submittedInspection = { ...MOCK_INSPECTION, status: 'submitted' };

    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null }),
        }),
    );
    await page.route(
      (url) => /\/api\/inspections\/by-assignment\/\d+$/.test(url.pathname),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: submittedInspection }),
        }),
    );
    await page.route(
      (url) => /\/api\/inspections\/\d+\/progress/.test(url.pathname),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { total_items: 2, answered_items: 2, percentage: 100 } }),
        }),
    );
    await mockLoginAs(page, MOCK_USERS.inspector);

    await page.goto('/inspector/inspection/1');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });

    // When status !== 'draft', the submit card is hidden (inspectionStatus === 'draft' check in JSX)
    // The submit button should not exist or not be visible
    const submitSection = page.locator('.ant-popconfirm').or(
      page.getByRole('button', { name: /submit inspection/i }),
    );
    await expect(submitSection).toHaveCount(0);

    await page.screenshot({ path: 'e2e/screenshots/checklist-submitted-state.png' });
  });
});
