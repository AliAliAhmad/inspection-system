import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'offline-cache' });

export const offlineCache = {
  // Store data with a key
  set<T>(key: string, data: T): void {
    storage.set(key, JSON.stringify(data));
  },

  // Get cached data
  get<T>(key: string): T | null {
    const raw = storage.getString(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  },

  // Remove cached data
  remove(key: string): void {
    storage.remove(key);
  },

  // Clear all cache
  clear(): void {
    storage.clearAll();
  },

  // Check if key exists
  has(key: string): boolean {
    return storage.contains(key);
  },

  // Get all keys
  getAllKeys(): string[] {
    return storage.getAllKeys();
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
