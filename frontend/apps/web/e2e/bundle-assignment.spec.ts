/**
 * Bundle assignment: dropping one worker on a bundle card staffs every job on
 * it, while dropping on a single job row still assigns only that job.
 *
 * Requires the local stack: vite on 3001 proxying /api to a seeded backend on
 * 5055 (admin@test.com / admin123, plus the seeded workers "Ahmed Mechanic" and
 * "Omar Electrician" — note the Team Pool displays first names only — and a
 * draft plan whose Sunday holds a 3-job Pump A-101 bundle).
 *
 * NEVER run this against production — vite.config.ts defaults its /api proxy to
 * the live Render API, so VITE_PROXY_TARGET must be set.
 *
 * Auth note: both the API and the web app rate-limit login, so this logs in
 * ONCE and injects the token into localStorage.
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
  await page.waitForTimeout(1500);
}

/** Open the Team Pool tab so employees become draggable. */
async function openTeamPool(page: Page) {
  await page.getByRole('tab', { name: /team pool/i }).click();
  await page.waitForTimeout(1000);
}

/** dnd-kit needs real incremental movement to clear its 8px activation constraint. */
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

test('dropping a worker on a bundle assigns every job on the card', async ({ page }) => {
  const bulkPayloads: any[] = [];
  const perJobCalls: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/jobs/bulk-assign')) {
      bulkPayloads.push(JSON.parse(req.postData() || '{}'));
    }
    if (/\/jobs\/\d+\/assignments$/.test(u) && req.method() === 'POST') {
      perJobCalls.push(u);
    }
  });

  await openPlanner(page);
  await openTeamPool(page);

  // The Team Pool renders FIRST NAMES only ("Ahmed"), not full names — scope to
  // the right panel so we grab the pool chip, not any other mention.
  const worker = page.locator('.wp-right-panel').getByText('Ahmed', { exact: true }).first();
  await expect(worker).toBeVisible({ timeout: 20000 });

  // The Pump A-101 bundle card header (3 jobs) — NOT an individual job row
  const bundle = page.locator('text=Pump A-101').first();
  await expect(bundle).toBeVisible({ timeout: 20000 });

  await dragTo(page, worker, bundle);

  // The modal must describe the WHOLE bundle before anything is written
  await expect(page.locator('text=/to all\\s*3 jobs/i')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /as lead/i }).click();
  await page.waitForTimeout(2500);

  expect(bulkPayloads.length, 'exactly one bulk-assign request').toBe(1);
  expect(bulkPayloads[0].job_ids.length, 'all 3 jobs in one request').toBe(3);
  expect(bulkPayloads[0].is_lead, 'lead flag forwarded').toBe(true);
  expect(perJobCalls.length, 'no per-job assign requests').toBe(0);
});

test('REGRESSION: dropping on a single job row still assigns only that job', async ({ page }) => {
  const perJobCalls: string[] = [];
  const bulkCalls: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/\/jobs\/\d+\/assignments$/.test(u) && req.method() === 'POST') perJobCalls.push(u);
    if (u.includes('/jobs/bulk-assign')) bulkCalls.push(u);
  });

  await openPlanner(page);
  await openTeamPool(page);

  // Expand the bundle so individual job rows become visible
  await page.locator('text=Pump A-101').first().click();
  await page.waitForTimeout(1000);

  const worker = page.locator('.wp-right-panel').getByText('Omar', { exact: true }).first();
  await expect(worker).toBeVisible({ timeout: 10000 });

  // An expanded bundle shows each job TWICE: once in the compact summary list in
  // the card header, and once as a real droppable row in the mech/elec block.
  // Only the second is a `droppable-job-*` target — the summary text belongs to
  // the bundle card, so dropping there correctly assigns the whole bundle.
  await expect(page.locator('text=Replace seal')).toHaveCount(2, { timeout: 10000 });
  const jobRow = page.locator('text=Replace seal').last();
  await expect(jobRow).toBeVisible({ timeout: 10000 });

  await dragTo(page, worker, jobRow);

  await expect(page.getByRole('button', { name: /as member/i })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /as member/i }).click();
  await page.waitForTimeout(2500);

  expect(perJobCalls.length, 'exactly one single-job assign request').toBe(1);
  expect(bulkCalls.length, 'the bundle target must NOT swallow a job-row drop').toBe(0);
});
