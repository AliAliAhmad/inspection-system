/**
 * Unit-aware overdue interpretation for work-plan jobs.
 *
 * - Calendar / day-based orders (unit = 'days'): POSITIVE value = overdue.
 * - Running-hours (performance) PMs (unit = 'hours'): the value is hours
 *   relative to the cycle trigger — NEGATIVE = past the trigger (overdue),
 *   POSITIVE = hours still remaining before due (NOT overdue).
 *
 * Use this everywhere the plan decides "is overdue?" or shows the amount, so a
 * not-yet-due performance PM (e.g. +58h remaining) is never mislabelled overdue.
 */
export interface OverdueLike {
  overdue_value?: number | null;
  overdue_unit?: string | null;
}

export interface OverdueInfo {
  isOverdue: boolean;
  amount: number; // positive magnitude past due (0 when not overdue)
  unit: string; // 'hours' | 'days'
  shortUnit: string; // 'h' | 'd'
}

export function getOverdueInfo(job: OverdueLike | null | undefined): OverdueInfo {
  const value = job?.overdue_value ?? 0;
  const unit = job?.overdue_unit || 'days';
  const shortUnit = unit === 'hours' ? 'h' : 'd';
  if (unit === 'hours') {
    // performance PM: overdue only when past the trigger (negative)
    return { isOverdue: value < 0, amount: value < 0 ? Math.abs(value) : 0, unit, shortUnit };
  }
  // day-based: overdue when positive
  return { isOverdue: value > 0, amount: value > 0 ? value : 0, unit, shortUnit };
}

export function isJobOverdue(job: OverdueLike | null | undefined): boolean {
  return getOverdueInfo(job).isOverdue;
}

/**
 * Relative "heat" for an overdue job. Because in practice almost every order is
 * technically overdue, a binary red flag is useless — instead we color each job
 * by HOW overdue it is relative to the worst one in the plan (per unit), so the
 * worst jobs run hot (deep red) and mild ones stay cool. Never a flat wall of red.
 */
export interface OverdueHeat {
  active: boolean;
  level: number;     // 0..1 fraction of the worst
  stripe: string;    // accent / left-stripe colour
  badgeBg: string;
  badgeText: string;
  cardTint: string;  // faint card background
  border: string;
  isWorst: boolean;  // top of the scale → gets the 🔥
}

const HEAT_NEUTRAL: OverdueHeat = {
  active: false, level: 0, stripe: '#f0f0f0', badgeBg: '#fafafa',
  badgeText: '#999', cardTint: '#fff', border: '#f0f0f0', isWorst: false,
};

// max overdue amount per unit across the plan, used to normalise the heat
export interface OverdueMax { days: number; hours: number }

export function getOverdueHeat(
  job: OverdueLike | null | undefined,
  max: OverdueMax | undefined,
): OverdueHeat {
  const info = getOverdueInfo(job);
  if (!info.isOverdue) return HEAT_NEUTRAL;
  const unitMax = info.unit === 'hours' ? (max?.hours ?? 0) : (max?.days ?? 0);
  const frac = unitMax > 0 ? Math.min(info.amount / unitMax, 1) : 1;
  const isWorst = unitMax > 0 && info.amount >= unitMax;
  let h;
  if (frac < 0.15)      h = { stripe: '#ffe58f', badgeBg: '#fffbe6', badgeText: '#ad8b00', cardTint: '#fffef5', border: '#ffe58f' };
  else if (frac < 0.35) h = { stripe: '#ffc53d', badgeBg: '#fff3cf', badgeText: '#ad6800', cardTint: '#fffcf0', border: '#ffd666' };
  else if (frac < 0.60) h = { stripe: '#fa8c16', badgeBg: '#fa8c16', badgeText: '#fff',    cardTint: '#fff7ed', border: '#fa8c16' };
  else if (frac < 0.85) h = { stripe: '#cf1322', badgeBg: '#cf1322', badgeText: '#fff',    cardTint: '#fff1f0', border: '#cf1322' };
  else                  h = { stripe: '#820014', badgeBg: '#820014', badgeText: '#fff',    cardTint: '#fff1f0', border: '#820014' };
  return { active: true, level: frac, isWorst, ...h };
}

/** Compute the per-unit max overdue across a list of jobs (for heat normalisation). */
export function computeOverdueMax(jobs: Array<OverdueLike> | undefined): OverdueMax {
  let days = 0, hours = 0;
  (jobs || []).forEach((j) => {
    const info = getOverdueInfo(j);
    if (!info.isOverdue) return;
    if (info.unit === 'hours') hours = Math.max(hours, info.amount);
    else days = Math.max(days, info.amount);
  });
  return { days, hours };
}
