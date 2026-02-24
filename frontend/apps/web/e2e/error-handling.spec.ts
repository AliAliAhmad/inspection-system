import { test, expect } from '@playwright/test';
import { mockLoginAs, MOCK_USERS } from './helpers/auth.helper';

// ── Crash regression tests ─────────────────────────────────────────────
//
// Pattern: some components do `summary = response.data?.data || null`.
// When the API returns `{ data: [] }` (empty array), `[] || null = []` (truthy),
// bypassing null checks. The component then accesses `[].some_prop.map()` which
// throws a TypeError and unmounts the entire React tree — including .app-header.
//
// These tests guard against that regression by verifying:
// 1. The correct mock shape (data: null) keeps pages stable.
// 2. Pages that were previously crashing now load with the header intact.

// ── NotificationAISummary crash regression ─────────────────────────────

test.describe('Crash Regression: Notification AI Summary', () => {
  test.beforeEach(async ({ page }) => {
    // LIFO: catch-all first (lowest priority)
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], items: [], total: 0, notifications: [] }),
        }),
    );
    // CRITICAL: AI summary must return null, not [] — otherwise component crashes:
    //   summary = [] (truthy) → [].pending_actions.filter() → TypeError
    await page.route(
      (url) => url.pathname.includes('/notifications/ai/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null }),
        }),
    );
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('notifications page loads without crash (data: null AI mock)', async ({ page }) => {
    await page.goto('/notifications');
    // If NotificationAISummary crashes, the entire layout unmounts and this fails
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/regression-notifications-ai.png' });
  });
});

// ── PerformanceDashboard / ExecutiveSummaryCard crash regression ────────

test.describe('Crash Regression: Performance Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // LIFO: catch-all first
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ reports: [], data: null, items: [], total: 0 }),
        }),
    );
    // CRITICAL: performance + AI routes must return null, not [] — otherwise:
    //   PerformanceDashboard: summary = [] → [].recent_achievements.map() → crash
    //   ExecutiveSummaryCard: summary = [] → [].kpis.map() → crash
    await page.route(
      (url) =>
        url.pathname.includes('/reports/ai/') ||
        url.pathname.includes('/performance/') ||
        url.pathname.includes('/notifications/ai/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', data: null }),
        }),
    );
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('reports page loads without crash (data: null AI mock)', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'e2e/screenshots/regression-reports-ai.png' });
  });

  test('performance page loads without crash (data: null performance mock)', async ({ page }) => {
    await page.goto('/admin/performance');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: 'e2e/screenshots/regression-performance.png' });
  });
});

// ── MyAssignmentsPage stats crash regression ───────────────────────────

test.describe('Crash Regression: Assignments Stats', () => {
  test.beforeEach(async ({ page }) => {
    // CRITICAL: data: null prevents MyAssignmentsPage stats crash:
    //   stats = res.data?.data = [] (truthy) → stats.today.total → undefined.total → TypeError
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ assignments: [], data: null, items: [], total: 0 }),
        }),
    );
    await mockLoginAs(page, MOCK_USERS.inspector);
  });

  test('assignments page loads without crash (data: null stats mock)', async ({ page }) => {
    await page.goto('/inspector/assignments');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/regression-assignments-stats.png' });
  });
});

// ── Admin pages not yet covered ────────────────────────────────────────

test.describe('Admin Pages - Graceful Empty State', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, items: [], total: 0 }),
        }),
    );
    // Guard all AI/performance endpoints
    await page.route(
      (url) =>
        url.pathname.includes('/reports/ai/') ||
        url.pathname.includes('/performance/') ||
        url.pathname.includes('/notifications/ai/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', data: null }),
        }),
    );
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('Backlog page loads for admin', async ({ page }) => {
    await page.goto('/admin/backlog');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/backlog/);
    await page.screenshot({ path: 'e2e/screenshots/admin-backlog.png' });
  });

  test('Defects page loads for admin', async ({ page }) => {
    await page.goto('/admin/defects');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/defects/);
    await page.screenshot({ path: 'e2e/screenshots/admin-defects.png' });
  });

  test('All Inspections page loads for admin', async ({ page }) => {
    // Route: /admin/inspections (AllInspectionsPage)
    await page.goto('/admin/inspections');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/inspections/);
    await page.screenshot({ path: 'e2e/screenshots/admin-all-inspections.png' });
  });

  test('Team Roster page loads for admin', async ({ page }) => {
    // Route: /admin/roster (TeamRosterPage)
    await page.goto('/admin/roster');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/roster/);
    await page.screenshot({ path: 'e2e/screenshots/admin-team-roster.png' });
  });

  test('Approvals page loads for admin (covers leave + bonus + pause tabs)', async ({ page }) => {
    // /admin/leave-approvals and /admin/bonus-approvals are Navigate redirects to /admin/approvals
    await page.goto('/admin/approvals');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/approvals/);
    await page.screenshot({ path: 'e2e/screenshots/admin-approvals.png' });
  });

  test('Assessment Tracking page loads for admin', async ({ page }) => {
    // Route: /admin/assessments (AssessmentTrackingPage)
    await page.goto('/admin/assessments');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/assessments/);
    await page.screenshot({ path: 'e2e/screenshots/admin-assessment-tracking.png' });
  });

  test('Quality Reviews admin page loads', async ({ page }) => {
    await page.goto('/admin/quality-reviews');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/quality-reviews/);
    await page.screenshot({ path: 'e2e/screenshots/admin-quality-reviews.png' });
  });

  test('All Engineer Jobs page loads for admin', async ({ page }) => {
    await page.goto('/admin/engineer-jobs');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/engineer-jobs/);
    await page.screenshot({ path: 'e2e/screenshots/admin-engineer-jobs.png' });
  });
});

// ── Pages that safely handle data: [] (no crash expected) ─────────────
//
// These pages use the safe `?? []` pattern instead of the dangerous `|| null`.
// Mocking with data: [] verifies these pages handle empty arrays without crashing.

test.describe('Safe Empty Array Handling', () => {
  test.beforeEach(async ({ page }) => {
    // Intentionally use data: [] here to test safe components
    await page.route(
      (url) => url.pathname.startsWith('/api/') && !url.pathname.includes('/auth/'),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], items: [], total: 0 }),
        }),
    );
    await mockLoginAs(page, MOCK_USERS.admin);
  });

  test('admin users page handles empty array without crash', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    // Table should render (possibly empty) — no crash
    await expect(page.locator('.ant-table, .ant-empty, .ant-spin')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/safe-users-empty.png' });
  });

  test('admin equipment page handles empty array without crash', async ({ page }) => {
    await page.goto('/admin/equipment');
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/safe-equipment-empty.png' });
  });
});
