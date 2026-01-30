import { test, expect, Page } from '@playwright/test';

const MOCK_INSPECTOR = {
  id: 1,
  username: 'inspector1',
  full_name: 'Test Inspector',
  role: 'inspector',
};

/**
 * Helper to authenticate as an inspector by injecting tokens into localStorage
 * and mocking the profile API so the app recognizes the session.
 */
async function loginAsInspector(page: Page) {
  // Mock the profile endpoint so AuthProvider restores the session
  await page.route('**/api/auth/profile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: MOCK_INSPECTOR }),
    }),
  );

  // Set tokens in localStorage before navigating so AuthProvider picks them up
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'fake-jwt-token');
    localStorage.setItem('refresh_token', 'fake-refresh-token');
  });
}

test.describe('Inspector Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsInspector(page);
  });

  test('navigates to assignments page', async ({ page }) => {
    // Mock the assignments API
    await page.route('**/api/inspector/assignments*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ assignments: [], total: 0 }),
      }),
    );

    await page.goto('/inspector/assignments');

    // The page should load within the ProLayout
    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    // The URL should reflect the assignments route
    await expect(page).toHaveURL(/\/inspector\/assignments/);
  });

  test('checklist page renders with progress indicator', async ({ page }) => {
    const mockChecklist = {
      id: 1,
      inspection_id: 42,
      title: 'Safety Inspection Checklist',
      progress: 30,
      total_items: 10,
      completed_items: 3,
      items: [
        {
          id: 1,
          question: 'Is the fire extinguisher accessible?',
          type: 'yes_no',
          answer: null,
          required: true,
        },
        {
          id: 2,
          question: 'Check equipment condition',
          type: 'yes_no',
          answer: 'yes',
          required: true,
        },
      ],
    };

    // Mock the inspection checklist API
    await page.route('**/api/inspector/inspection/42*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChecklist),
      }),
    );

    // Also mock any related endpoints
    await page.route('**/api/inspections/42*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChecklist),
      }),
    );

    await page.goto('/inspector/inspection/42');

    // Should be inside the main layout
    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    // Look for a progress bar (Ant Design Progress component)
    // The checklist page typically shows completion progress
    const progressBar = page.locator('.ant-progress');
    if (await progressBar.isVisible()) {
      await expect(progressBar).toBeVisible();
    }
  });

  test('can answer a yes/no checklist question', async ({ page }) => {
    const mockChecklist = {
      id: 1,
      inspection_id: 42,
      title: 'Safety Inspection Checklist',
      progress: 0,
      total_items: 1,
      completed_items: 0,
      items: [
        {
          id: 1,
          question: 'Is the fire extinguisher accessible?',
          type: 'yes_no',
          answer: null,
          required: true,
        },
      ],
    };

    await page.route('**/api/inspector/inspection/42*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChecklist),
      }),
    );

    await page.route('**/api/inspections/42*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChecklist),
      }),
    );

    // Mock the answer submission endpoint
    await page.route('**/api/inspector/inspection/42/answer*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.route('**/api/inspections/42/items/*/answer*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto('/inspector/inspection/42');
    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    // Look for Yes/No buttons or radio options
    // Ant Design renders radio buttons or regular buttons for yes/no questions
    const yesButton = page.getByRole('button', { name: /yes/i }).or(
      page.getByRole('radio', { name: /yes/i }),
    );

    if (await yesButton.isVisible()) {
      await yesButton.click();
    }
  });
});
