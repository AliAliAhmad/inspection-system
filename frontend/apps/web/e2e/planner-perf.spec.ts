/**
 * Guards the work-planner performance work.
 *
 * 1. Dragging a job FROM THE POOL lands optimistically — the card is on the day
 *    while the POST is still in flight (the test holds the response open).
 * 2. The planner makes ONE /week-inspections request, not one /day-inspections
 *    per day column (it used to fire 7).
 *
 * Requires the local stack: vite on 3001 proxying /api to the seeded backend on
 * 5055. NEVER run against production — VITE_PROXY_TARGET must be set.
 */
import { test, expect, Page, request as playwrightRequest } from '@playwright/test';

const BASE = 'http://localhost:3001';

test.describe.configure({ mode: 'serial', retries: 0 });

let token = '';

test.beforeAll(async () => {
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${BASE}/api/auth/login`, {
    data: { email: 'admin@test.com', password: 'admin123' },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  token = (await res.json()).access_token;
  await ctx.dispose();
});

async function openPlanner(page: Page) {
  await page.addInitScript((t) => localStorage.setItem('access_token', t), token);
  await page.goto(`${BASE}/admin/work-planning`);
  await page.waitForSelector('.wp-day-columns > *', { timeout: 30000 });
  await page.waitForTimeout(2500);
}

const dayColumnTexts = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.wp-day-columns > *')).map((c) => c.textContent || '')
  );

test('inspections cost ONE request for the whole week, not one per day', async ({ page }) => {
  const weekCalls: string[] = [];
  const dayCalls: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/week-inspections')) weekCalls.push(u);
    if (u.includes('/day-inspections')) dayCalls.push(u);
  });

  await openPlanner(page);

  expect(dayCalls.length, 'no per-day inspection requests').toBe(0);
  expect(weekCalls.length, 'at most one week request per berth').toBeLessThanOrEqual(1);
});

test('dragging from the pool lands the card optimistically', async ({ page }) => {
  // Hold the POST open: anything the board shows meanwhile came from the cache
  // patch, not the server.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/work-plans/*/jobs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await held;
    await route.continue();
  });

  await openPlanner(page);

  // Grab a job from the pool (right-hand panel) and drop it on an empty day.
  // Pool rows are plain divs; target one by its description text.
  const poolItem = page.locator('.wp-right-panel').getByText('Gearbox oil change', { exact: true }).first();
  await expect(poolItem).toBeVisible({ timeout: 20000 });

  const before = await dayColumnTexts(page);
  const emptyIdx = before.findIndex((t) => t.includes('Drag job here'));
  expect(emptyIdx, 'need an empty day column').toBeGreaterThan(-1);

  const target = page.locator('.wp-day-columns > *').nth(emptyIdx);
  const s = await poolItem.boundingBox();
  const t = await target.boundingBox();
  if (s && t) {
    const sx = s.x + s.width / 2, sy = s.y + s.height / 2;
    const tx = t.x + t.width / 2, ty = t.y + t.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(sx + ((tx - sx) * i) / 12, sy + ((ty - sy) * i) / 12, { steps: 2 });
    }
    await page.mouse.up();
  }

  await page.waitForTimeout(600);
  const during = await dayColumnTexts(page);

  // The POST is still in flight, yet the target column is no longer empty.
  expect(during[emptyIdx], 'card appears before the server replies')
    .not.toContain('Drag job here');

  release();
  await page.waitForTimeout(2000);
});
