import { test, expect, Page } from '@playwright/test';

interface MockUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

/**
 * Helper to set up an authenticated session with a given user/role.
 */
async function loginAs(page: Page, user: MockUser) {
  await page.route('**/api/auth/profile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    }),
  );

  await page.addInitScript(
    () => {
      localStorage.setItem('access_token', 'fake-jwt-token');
      localStorage.setItem('refresh_token', 'fake-refresh-token');
    },
  );
}

const users: Record<string, MockUser> = {
  admin: { id: 1, username: 'admin1', full_name: 'Test Admin', role: 'admin' },
  inspector: { id: 2, username: 'inspector1', full_name: 'Test Inspector', role: 'inspector' },
  specialist: { id: 3, username: 'specialist1', full_name: 'Test Specialist', role: 'specialist' },
  engineer: { id: 4, username: 'engineer1', full_name: 'Test Engineer', role: 'engineer' },
  quality_engineer: { id: 5, username: 'qe1', full_name: 'Test QE', role: 'quality_engineer' },
};

test.describe('Sidebar Navigation', () => {
  test('admin sees admin menu items in sidebar', async ({ page }) => {
    await loginAs(page, users.admin);
    await page.goto('/');

    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    // Admin should see role-specific items like Users, Equipment, Checklists
    // ProLayout renders menu items as links in the sidebar
    const sidebar = page.locator('.ant-pro-sider, .ant-layout-sider');
    await expect(sidebar).toBeVisible();

    // Check for admin-specific menu entries by path or text
    await expect(page.locator('a[href="/admin/users"], [data-menu-id*="users"]').or(
      page.getByText(/users/i).first(),
    )).toBeVisible();
  });

  test('inspector sees only inspector menu items', async ({ page }) => {
    await loginAs(page, users.inspector);
    await page.goto('/');

    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    // Inspector should see "My Assignments" in the sidebar
    // But should NOT see admin items like "Users"
    const pageContent = await page.content();

    // The sidebar should contain the assignments link
    expect(pageContent).toContain('/inspector/assignments');

    // Should NOT contain admin routes
    expect(pageContent).not.toContain('/admin/users');
  });

  test('engineer sees engineer-specific menu items', async ({ page }) => {
    await loginAs(page, users.engineer);
    await page.goto('/');

    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    const pageContent = await page.content();

    // Engineer should see their routes
    expect(pageContent).toContain('/engineer/jobs');

    // Should NOT contain admin or inspector routes
    expect(pageContent).not.toContain('/admin/users');
    expect(pageContent).not.toContain('/inspector/assignments');
  });
});

test.describe('Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, users.inspector);
  });

  test('navigates from dashboard to notifications', async ({ page }) => {
    // Mock notifications API
    await page.route('**/api/notifications*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notifications: [], total: 0 }),
      }),
    );

    await page.goto('/');
    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    // Click on notifications in the sidebar
    await page.click('[href="/notifications"], [data-menu-id*="notification"]');

    await expect(page).toHaveURL(/\/notifications/);
  });

  test('navigates from dashboard to leaderboard', async ({ page }) => {
    await page.route('**/api/leaderboard*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ leaderboard: [] }),
      }),
    );

    await page.goto('/');
    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    await page.click('[href="/leaderboard"], [data-menu-id*="leaderboard"]');

    await expect(page).toHaveURL(/\/leaderboard/);
  });
});

test.describe('Logout', () => {
  test('logout clears session and shows login page', async ({ page }) => {
    await loginAs(page, users.inspector);

    // Mock logout endpoint
    await page.route('**/api/auth/logout', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto('/');
    await expect(page.locator('.ant-pro-layout')).toBeVisible({ timeout: 10000 });

    // The user menu is in the top-right, rendered by ProLayout actionsRender.
    // Click on the user's name / avatar to open the dropdown.
    await page.getByText(users.inspector.full_name).click();

    // Click the logout option in the dropdown menu
    await page.getByText(/log\s*out/i).click();

    // Should return to the login page - look for the login form
    await expect(page.getByPlaceholder(/username/i)).toBeVisible({ timeout: 10000 });

    // localStorage tokens should be cleared
    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(accessToken).toBeNull();
  });
});
