/**
 * Environment configuration for E2E tests.
 * All values come from environment variables with sensible defaults.
 */

export const ENV = {
  /** Frontend URL to test against */
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  /** Admin credentials for login */
  ADMIN_EMAIL: process.env.TEST_USER_EMAIL || 'admin@process-test.com',
  ADMIN_PASSWORD: process.env.TEST_USER_PASSWORD || 'Admin123!',

  /** Inspector credentials (used in workflow tests) */
  INSPECTOR_EMAIL: process.env.TEST_INSPECTOR_EMAIL || 'inspector@process-test.com',
  INSPECTOR_PASSWORD: process.env.TEST_INSPECTOR_PASSWORD || 'Inspect123!',

  /** Optional: specific equipment to look for */
  EQUIPMENT_CODE: process.env.TEST_EQUIPMENT_CODE || '',

  /** Production safety flag */
  IS_PROD: process.env.RUN_PROD_TESTS?.toLowerCase() === 'true',

  /** Whether we're running against a remote (non-local) environment */
  IS_REMOTE: !!(process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')),
};

/**
 * Skip the current test if production safety rules apply.
 * Call this at the start of any test that writes data.
 */
export function skipIfProdUnsafe(testInfo: { skip: (condition: boolean, reason: string) => void }) {
  testInfo.skip(
    ENV.IS_PROD,
    'Skipped in production — this test creates data',
  );
}
