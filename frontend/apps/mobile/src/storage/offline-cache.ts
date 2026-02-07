import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'offline-cache:';

export const offlineCache = {
  // Store data with a key
  async set<T>(key: string, data: T): Promise<void> {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  },

  // Get cached data
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  },

  // Remove cached data
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  },

  // Clear all cache
  async clear(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
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
      .filter(k => k.startsWith(CACHE_PREFIX))
      .map(k => k.slice(CACHE_PREFIX.length));
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
