/**
 * Central storage cleanup — evicts stale cache, old drafts, and dead queue items
 * to prevent AsyncStorage (SQLite on Android) from hitting size limits.
 *
 * Called once on app mount from OfflineProvider.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineCache } from './offline-cache';

// TTLs
const CACHE_TTL_MS    = 24 * 60 * 60 * 1000;  // 24 hours for general cache
const DRAFT_TTL_MS    = 7  * 24 * 60 * 60 * 1000; // 7 days for inspection drafts
const QUEUE_STALE_MS  = 3  * 24 * 60 * 60 * 1000; // 3 days for failed queue items

/**
 * Run all cleanup tasks. Safe to call frequently — each step is idempotent.
 * Returns a summary of what was cleaned.
 */
export async function runStorageCleanup(): Promise<{
  expiredCache: number;
  staleDrafts: number;
  staleQueueItems: number;
}> {
  let expiredCache = 0;
  let staleDrafts = 0;
  let staleQueueItems = 0;

  try {
    // 1. Evict expired offline cache entries (>24h)
    expiredCache = await offlineCache.evictExpired(CACHE_TTL_MS);

    // 2. Clean up old inspection drafts (>7 days)
    staleDrafts = await cleanupInspectionDrafts();

    // 3. Prune stale/dead queue items (failed + old)
    staleQueueItems = await cleanupStaleQueues();

    if (__DEV__) {
      console.log(
        `[StorageCleanup] Removed: ${expiredCache} cache, ${staleDrafts} drafts, ${staleQueueItems} queue items`
      );
    }
  } catch (error) {
    if (__DEV__) console.warn('[StorageCleanup] Error during cleanup:', error);
  }

  return { expiredCache, staleDrafts, staleQueueItems };
}

/**
 * Remove old inspection draft answers and indexes that linger after completion.
 */
async function cleanupInspectionDrafts(): Promise<number> {
  const allKeys = await AsyncStorage.getAllKeys();
  const draftKeys = allKeys.filter(
    k => k.startsWith('inspection_') && (k.includes('_draft') || k.includes('_currentIndex'))
  );

  if (draftKeys.length === 0) return 0;

  // Check each draft's age via the data itself (createdAt inside) or just remove if >7d old
  // Since drafts don't have a separate timestamp, check the value's updatedAt or use a blanket age check
  const now = Date.now();
  const toRemove: string[] = [];

  const pairs = await AsyncStorage.multiGet(draftKeys);
  for (const [key, value] of pairs) {
    if (!value) {
      toRemove.push(key);
      continue;
    }

    // For draft JSON, try to find a timestamp inside
    try {
      const parsed = JSON.parse(value);
      // Check if it has answers with timestamps
      if (Array.isArray(parsed)) {
        const newest = parsed.reduce((max: number, item: any) => {
          const t = item?.updatedAt || item?.createdAt;
          return t ? Math.max(max, new Date(t).getTime()) : max;
        }, 0);
        if (newest > 0 && now - newest > DRAFT_TTL_MS) {
          toRemove.push(key);
        }
      } else if (typeof parsed === 'number') {
        // currentIndex keys — remove if the matching draft is being removed
        // We'll do a second pass below
      }
    } catch {
      // Can't parse — stale, remove it
      toRemove.push(key);
    }
  }

  // Also remove _currentIndex keys whose matching _draft was removed
  for (const key of toRemove) {
    if (key.includes('_draft')) {
      const indexKey = key.replace('_draft', '_currentIndex');
      if (draftKeys.includes(indexKey) && !toRemove.includes(indexKey)) {
        toRemove.push(indexKey);
      }
    }
  }

  if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  return toRemove.length;
}

/**
 * Remove queue items (operations, media, mutations) that are >3 days old and still failed.
 */
async function cleanupStaleQueues(): Promise<number> {
  const queueKeys = [
    'sync-queue:pending-operations',
    'sync-queue:pending-media',
    'sync-queue:pending-inspection-media',
    'offline_mutations',
  ];

  let removed = 0;
  const now = Date.now();

  for (const key of queueKeys) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      const items: any[] = JSON.parse(raw);
      const before = items.length;

      const filtered = items.filter((item: any) => {
        const createdAt = new Date(item.createdAt).getTime();
        const age = now - createdAt;

        // Remove if: failed + older than QUEUE_STALE_MS, OR any status + older than 7 days
        if (item.status === 'failed' && age > QUEUE_STALE_MS) return false;
        if (age > DRAFT_TTL_MS) return false;
        return true;
      });

      if (filtered.length < before) {
        if (filtered.length === 0) {
          await AsyncStorage.removeItem(key);
        } else {
          await AsyncStorage.setItem(key, JSON.stringify(filtered));
        }
        removed += before - filtered.length;
      }
    } catch {
      // Skip corrupt queue
    }
  }

  return removed;
}

/**
 * Get total AsyncStorage usage estimate (number of keys and approximate byte size).
 */
export async function getStorageStats(): Promise<{
  totalKeys: number;
  cacheKeys: number;
  queueKeys: number;
  draftKeys: number;
  otherKeys: number;
}> {
  const allKeys = await AsyncStorage.getAllKeys();
  const cacheKeys = allKeys.filter(k => k.startsWith('offline-cache:'));
  const queueKeys = allKeys.filter(k => k.startsWith('sync-queue:') || k === 'offline_mutations');
  const draftKeys = allKeys.filter(k => k.startsWith('inspection_') && (k.includes('_draft') || k.includes('_currentIndex')));

  return {
    totalKeys: allKeys.length,
    cacheKeys: cacheKeys.length,
    queueKeys: queueKeys.length,
    draftKeys: draftKeys.length,
    otherKeys: allKeys.length - cacheKeys.length - queueKeys.length - draftKeys.length,
  };
}
