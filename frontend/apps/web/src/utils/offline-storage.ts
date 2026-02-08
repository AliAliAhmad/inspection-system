/**
 * IndexedDB-based offline storage for web PWA.
 * Provides persistent storage for offline data and sync queue.
 */

const DB_NAME = 'inspection-offline-db';
const DB_VERSION = 1;

// Store names
const STORES = {
  CACHE: 'cache',
  SYNC_QUEUE: 'sync-queue',
} as const;

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize and get the IndexedDB instance.
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Cache store for offline data
      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        const cacheStore = db.createObjectStore(STORES.CACHE, { keyPath: 'key' });
        cacheStore.createIndex('expiry', 'expiry', { unique: false });
      }

      // Sync queue store for pending operations
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        syncStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

/**
 * Cache item with optional TTL.
 */
interface CacheItem<T = unknown> {
  key: string;
  value: T;
  expiry: number | null; // null = never expires
  createdAt: number;
}

/**
 * Pending sync operation.
 */
export interface SyncOperation {
  id?: number;
  type: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  payload?: unknown;
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

// ==================== CACHE OPERATIONS ====================

/**
 * Get a cached value by key.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.CACHE, 'readonly');
      const store = transaction.objectStore(STORES.CACHE);
      const request = store.get(key);

      request.onsuccess = () => {
        const item = request.result as CacheItem<T> | undefined;
        if (!item) {
          resolve(null);
          return;
        }

        // Check expiry
        if (item.expiry && item.expiry < Date.now()) {
          // Expired, delete and return null
          removeCached(key);
          resolve(null);
          return;
        }

        resolve(item.value);
      };

      request.onerror = () => {
        console.error('Failed to get cached item:', request.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set a cached value with optional TTL in milliseconds.
 */
export async function setCached<T>(key: string, value: T, ttlMs?: number): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CACHE, 'readwrite');
      const store = transaction.objectStore(STORES.CACHE);

      const item: CacheItem<T> = {
        key,
        value,
        expiry: ttlMs ? Date.now() + ttlMs : null,
        createdAt: Date.now(),
      };

      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Failed to set cached item:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Remove a cached value by key.
 */
export async function removeCached(key: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.CACHE, 'readwrite');
      const store = transaction.objectStore(STORES.CACHE);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Failed to remove cached item:', request.error);
        resolve();
      };
    });
  } catch (error) {
    console.error('Cache remove error:', error);
  }
}

/**
 * Clear all cached data.
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.CACHE, 'readwrite');
      const store = transaction.objectStore(STORES.CACHE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Failed to clear cache:', request.error);
        resolve();
      };
    });
  } catch (error) {
    console.error('Cache clear error:', error);
  }
}

/**
 * Clean up expired cache items.
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const db = await getDB();
    const now = Date.now();
    let deletedCount = 0;

    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.CACHE, 'readwrite');
      const store = transaction.objectStore(STORES.CACHE);
      const index = store.index('expiry');
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const item = cursor.value as CacheItem;
          if (item.expiry && item.expiry < now) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        console.error('Failed to cleanup expired cache:', request.error);
        resolve(deletedCount);
      };
    });
  } catch (error) {
    console.error('Cache cleanup error:', error);
    return 0;
  }
}

// ==================== SYNC QUEUE OPERATIONS ====================

/**
 * Add an operation to the sync queue.
 */
export async function enqueueSyncOperation(
  operation: Omit<SyncOperation, 'id' | 'createdAt' | 'retryCount'>
): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);

      const op: SyncOperation = {
        ...operation,
        createdAt: Date.now(),
        retryCount: 0,
      };

      const request = store.add(op);

      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => {
        console.error('Failed to enqueue sync operation:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Sync enqueue error:', error);
    throw error;
  }
}

/**
 * Get all pending sync operations.
 */
export async function getPendingSyncOperations(): Promise<SyncOperation[]> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readonly');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        console.error('Failed to get pending sync operations:', request.error);
        resolve([]);
      };
    });
  } catch (error) {
    console.error('Sync get error:', error);
    return [];
  }
}

/**
 * Get count of pending sync operations.
 */
export async function getPendingSyncCount(): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readonly');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.count();

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => {
        console.error('Failed to count pending sync operations:', request.error);
        resolve(0);
      };
    });
  } catch (error) {
    console.error('Sync count error:', error);
    return 0;
  }
}

/**
 * Remove a sync operation by ID.
 */
export async function removeSyncOperation(id: number): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Failed to remove sync operation:', request.error);
        resolve();
      };
    });
  } catch (error) {
    console.error('Sync remove error:', error);
  }
}

/**
 * Update retry count for a sync operation.
 */
export async function updateSyncOperationRetry(id: number, error?: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const op = getRequest.result as SyncOperation | undefined;
        if (op) {
          op.retryCount++;
          op.lastError = error;
          store.put(op);
        }
        resolve();
      };

      getRequest.onerror = () => {
        console.error('Failed to update sync operation:', getRequest.error);
        resolve();
      };
    });
  } catch (error) {
    console.error('Sync update error:', error);
  }
}

/**
 * Remove stale sync operations (failed too many times).
 */
export async function pruneStaleOperations(maxRetries: number = 5): Promise<number> {
  try {
    const operations = await getPendingSyncOperations();
    let prunedCount = 0;

    for (const op of operations) {
      if (op.retryCount >= maxRetries && op.id) {
        await removeSyncOperation(op.id);
        prunedCount++;
      }
    }

    return prunedCount;
  } catch (error) {
    console.error('Sync prune error:', error);
    return 0;
  }
}

/**
 * Clear all sync operations.
 */
export async function clearSyncQueue(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Failed to clear sync queue:', request.error);
        resolve();
      };
    });
  } catch (error) {
    console.error('Sync clear error:', error);
  }
}

// ==================== PREDEFINED CACHE KEYS ====================

export const CACHE_KEYS = {
  dashboard: 'dashboard',
  myAssignments: 'my-assignments',
  inspection: (id: number | string) => `inspection-${id}`,
  inspectionProgress: (id: number | string) => `inspection-progress-${id}`,
  specialistJobs: 'specialist-jobs',
  specialistJob: (id: number | string) => `specialist-job-${id}`,
  engineerJobs: 'engineer-jobs',
  engineerJob: (id: number | string) => `engineer-job-${id}`,
  myWorkPlan: (weekStart: string) => `my-work-plan-${weekStart}`,
  notifications: 'notifications',
  leaderboard: 'leaderboard',
  profile: 'profile',
  equipment: 'equipment',
} as const;

// ==================== INITIALIZATION ====================

/**
 * Initialize the offline storage.
 * Call this on app startup.
 */
export async function initOfflineStorage(): Promise<void> {
  try {
    await getDB();
    // Clean up expired items on startup
    const deleted = await cleanupExpiredCache();
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} expired cache items`);
    }
  } catch (error) {
    console.error('Failed to initialize offline storage:', error);
  }
}
