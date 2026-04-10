/**
 * Central storage cleanup — evicts stale cache, old drafts, and dead queue items
 * to prevent AsyncStorage (SQLite on Android) from hitting size limits.
 *
 * Called once on app mount from OfflineProvider.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineCache } from './offline-cache';

// TTLs — tuned to prevent SQLITE_FULL (code 13) on low-storage devices
const CACHE_TTL_MS    = 24 * 60 * 60 * 1000;        // 24 hours for general cache
const DRAFT_TTL_MS    = 3  * 24 * 60 * 60 * 1000;   // 3 days for inspection drafts (was 7)
const QUEUE_STALE_MS  = 1  * 24 * 60 * 60 * 1000;   // 24 hours for failed queue items (was 3 days)
const QUEUE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;   // 3 days max for ANY queue item (was 7 days)

/**
 * Run all cleanup tasks. Safe to call frequently — each step is idempotent.
 * Returns a summary of what was cleaned.
 */
export async function runStorageCleanup(): Promise<{
  expiredCache: number;
  staleDrafts: number;
  staleQueueItems: number;
  orphanedFiles: number;
}> {
  let expiredCache = 0;
  let staleDrafts = 0;
  let staleQueueItems = 0;
  let orphanedFiles = 0;

  try {
    // 1. Evict expired offline cache entries (>24h)
    expiredCache = await offlineCache.evictExpired(CACHE_TTL_MS);

    // 2. Clean up old inspection drafts (>3 days)
    staleDrafts = await cleanupInspectionDrafts();

    // 3. Prune stale/dead queue items (failed >24h, any >3 days)
    staleQueueItems = await cleanupStaleQueues();

    // 4. Delete orphaned voice/photo files not referenced by any queue
    orphanedFiles = await cleanupOrphanedFiles();

    if (__DEV__) {
      console.log(
        `[StorageCleanup] Removed: ${expiredCache} cache, ${staleDrafts} drafts, ${staleQueueItems} queue items, ${orphanedFiles} orphaned files`
      );
    }
  } catch (error) {
    if (__DEV__) console.warn('[StorageCleanup] Error during cleanup:', error);
  }

  return { expiredCache, staleDrafts, staleQueueItems, orphanedFiles };
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

        // Remove if: failed + older than 24h, OR any status + older than 3 days
        if (item.status === 'failed' && age > QUEUE_STALE_MS) return false;
        if (age > QUEUE_MAX_AGE_MS) return false;
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
 * Remove orphaned offline media files (voice/photo) that are no longer referenced
 * by any sync queue entry. These accumulate when queue items get pruned but the
 * physical file on disk is never deleted.
 */
async function cleanupOrphanedFiles(): Promise<number> {
  let removed = 0;
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

    // Gather all localUri references from ALL sync queues
    const referencedUris = new Set<string>();
    const queueKeys = [
      'sync-queue:pending-media',
      'sync-queue:pending-inspection-media',
    ];
    for (const key of queueKeys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const items: { localUri?: string }[] = JSON.parse(raw);
        items.forEach(item => { if (item.localUri) referencedUris.add(item.localUri); });
      } catch { /* skip corrupt */ }
    }

    // Also check offline_mutations for file references
    try {
      const raw = await AsyncStorage.getItem('offline_mutations');
      if (raw) {
        const items: { files?: { uri: string }[] }[] = JSON.parse(raw);
        items.forEach(item => item.files?.forEach(f => { if (f.uri) referencedUris.add(f.uri); }));
      }
    } catch { /* skip */ }

    // Scan and clean each offline directory
    const offlineDirs = [
      `${FileSystem.documentDirectory}offline-voice/`,
      `${FileSystem.documentDirectory}offline-photos/`,
    ];

    for (const dir of offlineDirs) {
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) continue;

        const files = await FileSystem.readDirectoryAsync(dir);
        for (const fileName of files) {
          const fullPath = `${dir}${fileName}`;
          if (!referencedUris.has(fullPath)) {
            await FileSystem.deleteAsync(fullPath, { idempotent: true });
            removed++;
          }
        }
      } catch { /* directory doesn't exist or inaccessible — skip */ }
    }
  } catch (error) {
    if (__DEV__) console.warn('[StorageCleanup] Orphaned file cleanup error:', error);
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
  estimatedBytes: number;
}> {
  const allKeys = await AsyncStorage.getAllKeys();
  const cacheKeys = allKeys.filter(k => k.startsWith('offline-cache:'));
  const queueKeys = allKeys.filter(k => k.startsWith('sync-queue:') || k === 'offline_mutations');
  const draftKeys = allKeys.filter(k => k.startsWith('inspection_') && (k.includes('_draft') || k.includes('_currentIndex')));

  // Estimate total byte size by sampling all values
  let estimatedBytes = 0;
  try {
    const pairs = allKeys.length > 0 ? await AsyncStorage.multiGet(allKeys) : [];
    for (const [key, value] of pairs) {
      estimatedBytes += (key?.length || 0) + (value?.length || 0);
    }
  } catch {
    // multiGet may fail on very large datasets — estimate from key count
    estimatedBytes = allKeys.length * 2048; // rough 2KB per entry estimate
  }

  return {
    totalKeys: allKeys.length,
    cacheKeys: cacheKeys.length,
    queueKeys: queueKeys.length,
    draftKeys: draftKeys.length,
    otherKeys: allKeys.length - cacheKeys.length - queueKeys.length - draftKeys.length,
    estimatedBytes,
  };
}

// Storage health thresholds
const STORAGE_WARNING_BYTES  = 4 * 1024 * 1024;  // 4MB AsyncStorage — warn user
const DEVICE_LOW_SPACE_BYTES = 100 * 1024 * 1024; // 100MB device free space — warn user

export type StorageHealth = 'healthy' | 'warning' | 'critical';

export interface StorageHealthCheck {
  health: StorageHealth;
  asyncStorageBytes: number;
  deviceFreeBytes: number | null;
  offlineFileBytes: number;
  message?: string;
  messageAr?: string;
}

/**
 * Check overall storage health — AsyncStorage size + device free space + offline files.
 * Returns a health status with bilingual messages for the UI.
 */
export async function checkStorageHealth(): Promise<StorageHealthCheck> {
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

  // 1. AsyncStorage byte estimate
  const stats = await getStorageStats();

  // 2. Device free space
  let deviceFreeBytes: number | null = null;
  try {
    const diskInfo = await FileSystem.getFreeDiskStorageAsync();
    deviceFreeBytes = diskInfo;
  } catch { /* not available on all platforms */ }

  // 3. Offline file sizes (voice + photos on disk)
  let offlineFileBytes = 0;
  const offlineDirs = [
    `${FileSystem.documentDirectory}offline-voice/`,
    `${FileSystem.documentDirectory}offline-photos/`,
  ];
  for (const dir of offlineDirs) {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) continue;
      const files = await FileSystem.readDirectoryAsync(dir);
      for (const fileName of files) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(`${dir}${fileName}`, { size: true });
          if (fileInfo.exists && 'size' in fileInfo) offlineFileBytes += fileInfo.size ?? 0;
        } catch { /* skip individual file */ }
      }
    } catch { /* dir doesn't exist */ }
  }

  // 4. Determine health
  let health: StorageHealth = 'healthy';
  let message: string | undefined;
  let messageAr: string | undefined;

  if (deviceFreeBytes !== null && deviceFreeBytes < DEVICE_LOW_SPACE_BYTES) {
    health = 'critical';
    const freeMB = Math.round(deviceFreeBytes / (1024 * 1024));
    message = `Your device has only ${freeMB}MB free. Clear cache to avoid errors.`;
    messageAr = `جهازك يحتوي فقط على ${freeMB} ميجابايت حرة. امسح الذاكرة المؤقتة لتجنب الأخطاء.`;
  } else if (stats.estimatedBytes > STORAGE_WARNING_BYTES) {
    health = 'warning';
    const sizeMB = (stats.estimatedBytes / (1024 * 1024)).toFixed(1);
    message = `App storage is ${sizeMB}MB. Consider clearing cache.`;
    messageAr = `حجم التخزين ${sizeMB} ميجابايت. يُنصح بمسح الذاكرة المؤقتة.`;
  } else if (offlineFileBytes > 50 * 1024 * 1024) {
    health = 'warning';
    const fileMB = Math.round(offlineFileBytes / (1024 * 1024));
    message = `${fileMB}MB of offline files on device. Connect to sync and free space.`;
    messageAr = `${fileMB} ميجابايت من الملفات غير المتصلة. اتصل بالإنترنت للمزامنة وتحرير المساحة.`;
  }

  return {
    health,
    asyncStorageBytes: stats.estimatedBytes,
    deviceFreeBytes,
    offlineFileBytes,
    message,
    messageAr,
  };
}

/**
 * Force-clear all non-essential storage (cache, expired drafts, failed queues, orphaned files).
 * Does NOT touch active pending sync items or current drafts.
 * Returns total bytes estimated freed.
 */
export async function clearAllCache(): Promise<{
  cacheCleared: number;
  draftsCleared: number;
  queuesCleaned: number;
  filesRemoved: number;
}> {
  // Clear all offline cache entries (not just expired)
  const allKeys = await AsyncStorage.getAllKeys();
  const cacheKeys = allKeys.filter(k => k.startsWith('offline-cache:'));
  const cacheCleared = cacheKeys.length;
  if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);

  // Run normal cleanup with aggressive TTLs (0 = remove everything stale)
  const draftsCleared = await cleanupInspectionDrafts();
  const queuesCleaned = await cleanupStaleQueues();
  const filesRemoved = await cleanupOrphanedFiles();

  return { cacheCleared, draftsCleared, queuesCleaned, filesRemoved };
}
