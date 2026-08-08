/**
 * Verifies the work-planner drag & drop performance fixes in a real browser.
 *
 * Proves the three things the fix claims:
 *  1. a dropped bundle lands OPTIMISTICALLY — the DOM updates while the
 *     server request is still in flight (deliberately held open by the test)
 *  2. a bundle drag issues ONE bulk request, not one per job
 *  3. a FAILED drop rolls back instead of stranding the card in the wrong day
 *
 * Requires the local stack: vite on 3001 proxying /api to a seeded backend
 * (admin@test.com / admin123, draft plan for the current week with a 3-job
 * Pump A-101 bundle on Sunday).
 *
 * Auth note: both the API and the web app rate-limit login, so this logs in
 * ONCE and injects the token into localStorage for each test.
 */
import { test, expect, Page, request as playwrightRequest } from '@playwright/test';

const BASE = 'http://localhost:3001';
const BUNDLE_JOB_IDS = [1, 2, 3];
const SUNDAY_DAY_ID = 1;
/** Wednesday — empty in the seed, and NOT adjacent to the source column. */
const TARGET_DAY_INDEX = 3;

// One login for the whole file — see auth note above
test.describe.configure({ mode: 'serial', retries: 0 });

let token = '';

test.beforeAll(async () => {
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${BASE}/api/auth/login`, {
    data: { email: 'admin@test.com', password: 'admin123' },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  token = (await res.json()).access_token;
  await ctx.dispose();
});

/** Put the 3-job bundle back on Sunday so each test starts from a known board. */
async function resetBoard() {
  const ctx = await playwrightRequest.newContext();
  await ctx.post(`${BASE}/api/work-plans/1/jobs/bulk-move`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { job_ids: BUNDLE_JOB_IDS, target_day_id: SUNDAY_DAY_ID },
  });
  await ctx.dispose();
}

async function openPlanner(page: Page) {
  await page.addInitScript((t) => {
    localStorage.setItem('access_token', t);
  }, token);
  await page.goto(`${BASE}/admin/work-planning`);
  await page.waitForSelector('.wp-day-columns > *', { timeout: 30000 });
  await page.waitForTimeout(1500);
}

/** Text of each of the 7 day columns, so we can assert where the bundle sits. */
function dayColumnTexts(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.wp-day-columns > *')).map((c) => c.textContent || '')
  );
}

/**
 * Nth day column (0 = Sunday). Target columns by index, NOT by matching
 * "Drag job here" — several days are empty and share that text.
 */
const dayColumn = (page: Page, index: number) =>
  page.locator('.wp-day-columns > *').nth(index);

/** dnd-kit needs real pointer movement past its 8px activation constraint. */
async function dragTo(page: Page, source: any, target: any) {
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  if (!s || !t) throw new Error('missing bounding box for drag');

  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2;
  const ty = t.y + t.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 12, sy + ((ty - sy) * i) / 12, { steps: 2 });
  }
  await page.mouse.up();
}

test.describe('work planner drag & drop', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('bundle lands optimistically via ONE bulk request', async ({ page }) => {
    const bulkCalls: string[] = [];
    const perJobCalls: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/jobs/bulk-move')) bulkCalls.push(u);
      if (/\/jobs\/\d+\/move/.test(u)) perJobCalls.push(u);
    });

    // Hold the server response open, so anything the UI shows in the meantime
    // can ONLY have come from the optimistic cache patch.
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/jobs/bulk-move', async (route) => {
      await held;
      await route.continue();
    });

    await openPlanner(page);

    const before = await dayColumnTexts(page);
    expect(before[0], 'bundle starts on Sunday').toContain('Pump A-101');
    expect(before[TARGET_DAY_INDEX], 'target day starts empty').toContain('Drag job here');

    const bundle = page.locator('text=Pump A-101').first();
    await dragTo(page, bundle, dayColumn(page, TARGET_DAY_INDEX));

    // --- the actual proof of the fix ---
    // The request is still in flight (never released), yet the board has moved.
    await page.waitForTimeout(500);
    const duringFlight = await dayColumnTexts(page);

    expect(bulkCalls.length, 'exactly ONE bulk-move request').toBe(1);
    expect(perJobCalls.length, 'ZERO per-job move requests').toBe(0);
    expect(duringFlight[0], 'bundle already gone from Sunday').not.toContain('Pump A-101');
    expect(duringFlight[TARGET_DAY_INDEX], 'bundle already shown on target day').toContain('Pump A-101');
    expect(duringFlight[TARGET_DAY_INDEX], 'all 3 jobs moved together').toContain('3 jobs');

    release();
    await page.waitForTimeout(2000);

    // Still correct after the server responds and the refetch reconciles
    const after = await dayColumnTexts(page);
    expect(after[TARGET_DAY_INDEX], 'bundle persists on target day after refetch').toContain('Pump A-101');
    expect(after[0], 'Sunday still empty of the bundle').not.toContain('Pump A-101');
  });

  test('failed drop rolls back to the original day', async ({ page }) => {
    await page.route('**/jobs/bulk-move', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Simulated server failure' }),
      })
    );

    await openPlanner(page);

    const before = await dayColumnTexts(page);
    expect(before[0], 'bundle starts on Sunday').toContain('Pump A-101');

    const bundle = page.locator('text=Pump A-101').first();
    await dragTo(page, bundle, dayColumn(page, TARGET_DAY_INDEX));

    await page.waitForTimeout(2500);

    const after = await dayColumnTexts(page);
    expect(after[0], 'bundle rolled back to Sunday').toContain('Pump A-101');
    expect(after[TARGET_DAY_INDEX], 'target day empty again after rollback').not.toContain('Pump A-101');
  });
});
