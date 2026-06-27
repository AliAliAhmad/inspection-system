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
