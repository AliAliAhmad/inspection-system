import { Page, expect } from '@playwright/test';

/**
 * Connection failure diagnosis helpers.
 * These provide clear error messages when frontend ↔ backend communication fails.
 */

export interface RequestDiagnostics {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  isCORS: boolean;
  isAuthError: boolean;
  isNetworkError: boolean;
}

/**
 * Make an API request and return diagnostics about the response.
 * Used to verify frontend→backend connectivity.
 */
export async function diagnoseAPICall(
  page: Page,
  path: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
  },
): Promise<RequestDiagnostics> {
  const method = options?.method ?? 'GET';

  try {
    const response = await page.request.fetch(path, {
      method,
      headers: options?.headers,
      data: options?.data,
    });

    const status = response.status();
    const headers = response.headers();
    const body = await response.text();

    return {
      url: path,
      status,
      statusText: response.statusText(),
      headers,
      body,
      isCORS: status === 0 || headers['access-control-allow-origin'] === undefined,
      isAuthError: status === 401 || status === 403,
      isNetworkError: false,
    };
  } catch (error: any) {
    return {
      url: path,
      status: 0,
      statusText: 'Network Error',
      headers: {},
      body: error.message || 'Unknown network error',
      isCORS: true,
      isAuthError: false,
      isNetworkError: true,
    };
  }
}

/**
 * Collect console errors from the page during test execution.
 * Useful for detecting CORS errors, JS errors, and failed API calls.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`Page error: ${err.message}`);
  });
  return errors;
}

/**
 * Collect failed network requests from the page.
 */
export function collectFailedRequests(page: Page): Array<{ url: string; status: number; method: string }> {
  const failures: Array<{ url: string; status: number; method: string }> = [];
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
      });
    }
  });
  return failures;
}

/**
 * Assert that a response has the expected JSON shape.
 */
export function assertResponseShape(body: string, requiredKeys: string[], context: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`${context}: Response is not valid JSON. Body: ${body.slice(0, 200)}`);
  }

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(
        `${context}: Response missing key "${key}". Got keys: [${Object.keys(parsed).join(', ')}]`,
      );
    }
  }

  return parsed;
}
