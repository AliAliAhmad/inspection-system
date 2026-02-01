/**
 * B) Backend Connection Validation
 * ==================================
 * Verifies frontend ↔ backend communication is healthy:
 * - No CORS errors
 * - Authorization header sent correctly
 * - API responses consumed by the UI
 */

import { test, expect } from '@playwright/test';
import { loginViaAPI, loginViaUI, expectAuthenticated } from '../helpers/auth';
import { ENV } from '../helpers/env';
import {
  diagnoseAPICall,
  collectConsoleErrors,
  collectFailedRequests,
  assertResponseShape,
} from '../helpers/diagnostics';

test.describe('B) Backend Connection', () => {
  test('B1: Health endpoint is reachable', async ({ page }) => {
    const diag = await diagnoseAPICall(page, '/health');

    expect(diag.isNetworkError).toBe(false);
    expect(diag.status).toBe(200);

    const body = assertResponseShape(diag.body, ['status'], 'Health endpoint');
    expect(body.status).toBe('healthy');
  });

  test('B2: Root API endpoint returns system info', async ({ page }) => {
    const diag = await diagnoseAPICall(page, '/');

    expect(diag.isNetworkError).toBe(false);
    expect(diag.status).toBe(200);

    const body = assertResponseShape(diag.body, ['status'], 'Root endpoint');
    expect(body.status).toBe('running');
  });

  test('B3: Login API returns valid token structure', async ({ page }) => {
    const diag = await diagnoseAPICall(page, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { email: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD },
    });

    expect(diag.isNetworkError).toBe(false);
    expect(diag.status).toBe(200);
    expect(diag.isAuthError).toBe(false);

    const body = assertResponseShape(
      diag.body,
      ['access_token'],
      'Login API',
    );
    expect(body.access_token).toBeTruthy();
  });

  test('B4: Authenticated API calls include Authorization header', async ({ page }) => {
    // Login via API to get token
    const { accessToken } = await loginViaAPI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);

    // Make an authenticated request
    const diag = await diagnoseAPICall(page, '/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(diag.status).toBe(200);
    expect(diag.isAuthError).toBe(false);

    const body = assertResponseShape(diag.body, ['user'], 'Profile API');
    expect(body.user.email).toBe(ENV.ADMIN_EMAIL);
  });

  test('B5: Unauthenticated requests are properly rejected', async ({ page }) => {
    const diag = await diagnoseAPICall(page, '/api/inspections');

    expect(diag.status).toBeGreaterThanOrEqual(401);
    expect(diag.status).toBeLessThan(500);
    expect(diag.isAuthError).toBe(true);
  });

  test('B6: Frontend loads data from backend after login (no CORS errors)', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    const failedRequests = collectFailedRequests(page);

    await loginViaUI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await expectAuthenticated(page);

    // Wait for dashboard data to load
    await page.waitForTimeout(3_000);

    // Check for CORS errors in console
    const corsErrors = consoleErrors.filter(
      (e) =>
        e.toLowerCase().includes('cors') ||
        e.toLowerCase().includes('cross-origin') ||
        e.toLowerCase().includes('access-control'),
    );
    expect(corsErrors).toHaveLength(0);

    // Check that API calls succeeded (allow some 404s for optional endpoints)
    const criticalFailures = failedRequests.filter(
      (f) =>
        f.url.includes('/api/') &&
        f.status >= 500,
    );
    expect(criticalFailures).toHaveLength(0);
  });

  test('B7: API responses have expected JSON shapes', async ({ page }) => {
    const { accessToken } = await loginViaAPI(page, ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Equipment list
    const equipDiag = await diagnoseAPICall(page, '/api/equipment', { headers });
    if (equipDiag.status === 200) {
      assertResponseShape(equipDiag.body, ['data'], 'Equipment API');
    }

    // Defects list
    const defectDiag = await diagnoseAPICall(page, '/api/defects', { headers });
    if (defectDiag.status === 200) {
      assertResponseShape(defectDiag.body, ['data'], 'Defects API');
    }

    // Inspections list
    const inspDiag = await diagnoseAPICall(page, '/api/inspections', { headers });
    if (inspDiag.status === 200) {
      assertResponseShape(inspDiag.body, ['data'], 'Inspections API');
    }
  });
});
