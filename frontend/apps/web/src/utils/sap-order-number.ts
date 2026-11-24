/**
 * The SAP order number a card should show, or null.
 *
 * Ali, 2026-11-25: "why the SAP order number is not showing in the PRM orders,
 * in the planning?" — "even the defect from sap". The pool card dropped it in
 * the 2026-02-09 sidebar redesign and the day card never had it, so a planner
 * had to open Job Details to read the number he types into SAP.
 *
 * Every order SAP sent shows its number — PRM and the fault types alike. A job
 * on a day carries `sap_order_number`, a pool order `order_number`. A hand-typed
 * job (`MAN-…`, decided by the server as `is_manual`) has no SAP number to show:
 * its card says "✎ by hand" instead.
 */
export const sapOrderNumber = (job: any): string | null => {
  if (!job || job.is_manual) return null;
  const number = job.sap_order_number ?? job.order_number;
  return number ? String(number) : null;
};
