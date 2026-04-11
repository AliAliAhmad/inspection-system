/**
 * Offline Provider for Web PWA
 * Manages offline state, sync queue, and network status.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { apiClient } from '@inspection/shared';
import {
  initOfflineStorage,
  getPendingSyncCount,
  getPendingSyncOperations,
  removeSyncOperation,
  updateSyncOperationRetry,
  pruneStaleOperations,
  type SyncOperation,
} from '../utils/offline-storage';

interface OfflineContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  triggerSync: async () => {},
});

export function useOffline() {
  return useContext(OfflineContext);
}

interface OfflineProviderProps {
  children: React.ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const syncInProgress = useRef(false);

  // Initialize offline storage
  useEffect(() => {
    initOfflineStorage();
    refreshPendingCount();
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      message.success('You are back online');
      // Auto-sync when coming back online
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      message.warning('You are offline. Changes will be synced when you reconnect.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodically check for pending operations
  useEffect(() => {
    const interval = setInterval(() => {
      refreshPendingCount();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingCount(count);
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncInProgress.current || !navigator.onLine) {
      return;
    }

    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      // Prune stale operations first
      await pruneStaleOperations(5);

      // Get pending operations
      const operations = await getPendingSyncOperations();

      if (operations.length === 0) {
        setLastSyncAt(new Date());
        return;
      }

      let successCount = 0;
      let failCount = 0;

      // Process operations sequentially
      for (const op of operations) {
        try {
          await processOperation(op);
          if (op.id) {
            await removeSyncOperation(op.id);
          }
          successCount++;
        } catch (error) {
          failCount++;
          if (op.id) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await updateSyncOperationRetry(op.id, errorMessage);
          }

          // Stop on auth errors
          if (isAuthError(error)) {
            break;
          }
        }
      }

      // Refresh pending count
      await refreshPendingCount();
      setLastSyncAt(new Date());

      // Show result
      if (successCount > 0 && failCount === 0) {
        message.success(`Synced ${successCount} pending changes`);
      } else if (successCount > 0 && failCount > 0) {
        message.warning(`Synced ${successCount} changes, ${failCount} failed`);
      } else if (failCount > 0) {
        message.error(`Failed to sync ${failCount} changes`);
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [refreshPendingCount]);

  const value: OfflineContextValue = {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncAt,
    triggerSync,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/**
 * Process a single sync operation.
 */
async function processOperation(op: SyncOperation): Promise<void> {
  const config = {
    method: op.method,
    url: op.endpoint,
    data: op.payload,
  };

  await apiClient.request(config);
}

/**
 * Check if error is an auth error.
 */
function isAuthError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    return response?.status === 401 || response?.status === 403;
  }
  return false;
}

export default OfflineProvider;
