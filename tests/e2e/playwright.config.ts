import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for real frontend ↔ backend E2E integration tests.
 *
 * Environment variables:
 *   FRONTEND_URL       - Frontend URL (default: http://localhost:3000)
 *   TEST_USER_EMAIL    - Login email for tests
 *   TEST_USER_PASSWORD - Login password for tests
 *   RUN_PROD_TESTS     - Set to "true" to allow production tests
 *   HEADED             - Set to "true" to run in headed mode
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const isCI = !!process.env.CI;
const isHeaded = process.env.HEADED === 'true';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,         // Sequential — tests share state (login token)
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,                   // Single worker for sequential workflow
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../test-results/e2e-report', open: 'never' }],
  ],
  timeout: 60_000,              // 60s per test (network latency for remote)
  expect: {
    timeout: 15_000,            // 15s for assertions (lazy-loaded pages)
  },
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: !isHeaded,
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
