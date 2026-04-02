/**
 * Pre-fetch all assignment data for offline use.
 * Called on login and app launch so inspectors can work on-site without internet.
 */
import { inspectionAssignmentsApi, inspectionsApi } from '@inspection/shared';
import { offlineCache } from '../storage/offline-cache';

export async function prefetchAllAssignments(): Promise<number> {
  let cachedCount = 0;

  try {
    // Evict expired cache entries before prefetching to free space
    await offlineCache.evictExpired();

    // Fetch all assignments
    const res = await inspectionAssignmentsApi.getMyAssignments();
    const allAssignments = (res.data as any)?.data ?? res.data;
    if (!Array.isArray(allAssignments) || allAssignments.length === 0) return 0;

    // Cache the assignments list itself
    await offlineCache.set('my-assignments', allAssignments);

    // Sort by deadline priority: today first, tomorrow second, rest last
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const sorted = [...allAssignments].sort((a: any, b: any) => {
      const aDate = (a.deadline || '').slice(0, 10);
      const bDate = (b.deadline || '').slice(0, 10);
      const aPriority = aDate === todayStr ? 0 : aDate === tomorrowStr ? 1 : 2;
      const bPriority = bDate === todayStr ? 0 : bDate === tomorrowStr ? 1 : 2;
      return aPriority - bPriority;
    });

    for (const assignment of sorted) {
      try {
        // 1. Pre-fetch inspection data (includes checklist items + answers)
        const inspRes = await inspectionsApi.getByAssignment(assignment.id);
        const inspData = (inspRes.data as any)?.data ?? inspRes.data;
        await offlineCache.set(`inspection-${assignment.id}`, inspData);

        const inspectionId = inspData?.id;
        const equipmentId = inspData?.equipment_id ?? assignment.equipment_id;

        // 2. Pre-fetch colleague answers
        if (inspectionId) {
          try {
            const colleagueRes = await inspectionsApi.getColleagueAnswers(inspectionId);
            await offlineCache.set(`colleague-answers-${assignment.id}`, colleagueRes.data);
          } catch { /* optional */ }
        }

        // 3. Pre-fetch inspection progress
        if (inspectionId) {
          try {
            const progressRes = await inspectionsApi.getProgress(inspectionId);
            const progressData = (progressRes.data as any)?.data ?? progressRes.data;
            await offlineCache.set(`inspection-progress-${inspectionId}`, progressData);
          } catch { /* optional */ }
        }

        // 4. Pre-fetch defect history for equipment
        if (equipmentId) {
          try {
            const historyRes = await inspectionsApi.getChecklistItemHistory(equipmentId);
            await offlineCache.set(`checklist-item-history-${equipmentId}`, historyRes.data);
          } catch { /* optional */ }
        }

        cachedCount++;
      } catch {
        // Skip failed items, continue with next
      }
    }

    if (__DEV__) console.log(`[Prefetch] Cached ${cachedCount}/${sorted.length} assignments`);
  } catch (error) {
    console.warn('[Prefetch] Failed to fetch assignments:', error);
  }

  return cachedCount;
}
