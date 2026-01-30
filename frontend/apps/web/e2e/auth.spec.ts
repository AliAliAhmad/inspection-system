import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders login form with username and password fields', async ({ page }) => {
    // The app shows LoginPage when not authenticated
    await expect(page.getByPlaceholder(/username/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log\s*in|sign\s*in/i })).toBeVisible();
  });

  test('shows validation errors when submitting empty form', async ({ page }) => {
    // Click the submit button without filling fields
    await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();

    // Ant Design form validation messages should appear
    // The LoginPage uses rules with required: true and custom messages from i18n
    await expect(page.locator('.ant-form-item-explain-error')).toHaveCount(2);
  });

  test('shows error alert on failed login', async ({ page }) => {
    // Mock the login API to return an error
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      }),
    );

    await page.getByPlaceholder(/username/i).fill('wronguser');
    await page.getByPlaceholder(/password/i).fill('wrongpass');
    await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();

    // An Alert with error type should appear
    await expect(page.locator('.ant-alert-error')).toBeVisible();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    const mockUser = {
      id: 1,
      username: 'inspector1',
      full_name: 'Test Inspector',
      role: 'inspector',
    };

    // Mock login endpoint
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake-jwt-token',
          refresh_token: 'fake-refresh-token',
          user: mockUser,
        }),
      }),
    );

    // Mock profile endpoint (called after token is stored)
    await page.route('**/api/auth/profile', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: mockUser }),
      }),
    );

    await page.getByPlaceholder(/username/i).fill('inspector1');
    await page.getByPlaceholder(/password/i).fill('password123');
    await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();

    // After login the LoginPage should disappear and we should see the layout
    // ProLayout renders a sidebar with menu items
    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });
  });

  test('language selector switches between English and Arabic', async ({ page }) => {
    // The login page has a language selector
    const languageSelect = page.locator('.ant-select');
    await expect(languageSelect).toBeVisible();

    // Click to open dropdown and select Arabic
    await languageSelect.click();
    await page.getByText('العربية').click();

    // The page direction or language should change - placeholder text will update
    // We just verify the select value changed
    await expect(page.locator('.ant-select-selection-item')).toHaveText('العربية');
  });
});
