import { Page } from '@playwright/test';

/** Navigate to path and wait for the authenticated app header. */
export async function goToPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForSelector('.app-header', { timeout: 20000 });
}

/** Open the App Launcher popup. */
export async function openLauncher(page: Page): Promise<void> {
  await page.locator('.launcher-trigger').click();
  await page.waitForSelector('.launcher-app-item', { timeout: 5000 });
}

/** Wait for main app layout to appear. */
export async function waitForAppLoad(page: Page): Promise<void> {
  await page.waitForSelector('.app-header', { timeout: 20000 });
}
