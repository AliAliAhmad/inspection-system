import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'offline-cache:';

// Default TTL: 24 hours
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export const offlineCache = {
  // Store data with a key
  async set<T>(key: string, data: T): Promise<void> {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
    await AsyncStorage.setItem(CACHE_PREFIX + key + ':ts', String(Date.now()));
  },

  // Get cached data (returns null if expired beyond ttlMs)
  async get<T>(key: string, ttlMs?: number): Promise<T | null> {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;

    // If TTL specified, check expiration
    if (ttlMs !== undefined) {
      const ts = await AsyncStorage.getItem(CACHE_PREFIX + key + ':ts');
      if (ts && Date.now() - Number(ts) > ttlMs) {
        // Expired — remove and return null
        await offlineCache.remove(key);
        return null;
      }
    }

    try { return JSON.parse(raw) as T; }
    catch { return null; }
  },

  // Get cache timestamp for a key
  async getTimestamp(key: string): Promise<number | null> {
    const ts = await AsyncStorage.getItem(CACHE_PREFIX + key + ':ts');
    return ts ? Number(ts) : null;
  },

  // Remove cached data
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
    await AsyncStorage.removeItem(CACHE_PREFIX + key + ':ts');
  },

  // Clear all cache
  async clear(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
  },

  // Check if key exists
  async has(key: string): Promise<boolean> {
    const value = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return value !== null;
  },

  // Get all keys
  async getAllKeys(): Promise<string[]> {
    const keys = await AsyncStorage.getAllKeys();
    return keys
      .filter(k => k.startsWith(CACHE_PREFIX) && !k.endsWith(':ts'))
      .map(k => k.slice(CACHE_PREFIX.length));
  },

  // Remove all entries older than ttlMs (default 24h)
  async evictExpired(ttlMs: number = DEFAULT_TTL_MS): Promise<number> {
    const allKeys = await AsyncStorage.getAllKeys();
    const tsKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX) && k.endsWith(':ts'));
    const now = Date.now();
    const toRemove: string[] = [];

    // Batch-read all timestamps
    const pairs = tsKeys.length > 0 ? await AsyncStorage.multiGet(tsKeys) : [];
    for (const [tsKey, tsVal] of pairs) {
      if (!tsVal) continue;
      if (now - Number(tsVal) > ttlMs) {
        // Remove both data key and timestamp key
        const dataKey = tsKey.slice(0, -3); // remove ':ts'
        toRemove.push(dataKey, tsKey);
      }
    }

    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
    return toRemove.length / 2; // number of entries removed
  },
};

// Cache key helpers
export const CacheKeys = {
  myAssignments: 'my-assignments',
  inspection: (id: number) => `inspection-${id}`,
  inspectionProgress: (id: number) => `inspection-progress-${id}`,
  specialistJobs: 'specialist-jobs',
  specialistJob: (id: number) => `specialist-job-${id}`,
  engineerJobs: 'engineer-jobs',
  engineerJob: (id: number) => `engineer-job-${id}`,
  pendingReviews: 'pending-reviews',
  notifications: 'notifications',
  dashboard: 'dashboard',
  leaderboard: 'leaderboard',
  profile: 'profile',
};
