import { test, expect, Page } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

// IMPORTANT: Register catch-all BEFORE mockLoginAs (LIFO order fix).
async function setupPage(page: Page, role = MOCK_USERS.admin) {
  await page.route(
    (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], items: [], total: 0, results: [] }),
    }),
  );
  await mockLoginAs(page, role);
  await page.goto('/');
  await page.waitForSelector('.app-header', { timeout: 20000 });
}

// ── Login Form Validation ──────────────────────────────────────

test.describe('Login Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('empty username shows validation error', async ({ page }) => {
    await page.getByPlaceholder(/password/i).fill('somepassword');
    await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible({ timeout: 5000 });
  });

  test('empty password shows validation error', async ({ page }) => {
    await page.getByPlaceholder(/email or username/i).fill('someuser');
    await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible({ timeout: 5000 });
  });

  test('both fields empty shows two validation errors', async ({ page }) => {
    await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
    await expect(page.locator('.ant-form-item-explain-error')).toHaveCount(2);
  });

  test('submit button exists and is clickable', async ({ page }) => {
    const btn = page.getByRole('button', { name: /log\s*in|sign\s*in/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });
});

// ── Profile Page ───────────────────────────────────────────────

test.describe('Profile Page', () => {
  test('profile page loads with expected structure', async ({ page }) => {
    await setupPage(page);
    await page.goto('/profile');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/profile/);
    await page.screenshot({ path: 'e2e/screenshots/forms-profile.png' });
  });
});

// ── Create Job Form (engineer) ─────────────────────────────────

test.describe('Create Job Form', () => {
  test('create job page loads for engineer', async ({ page }) => {
    await setupPage(page, MOCK_USERS.engineer);
    await page.goto('/engineer/jobs/create');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/engineer\/jobs\/create/);
    await page.screenshot({ path: 'e2e/screenshots/forms-create-job.png' });
  });
});
