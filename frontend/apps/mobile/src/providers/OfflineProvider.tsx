import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { getApiClient } from '@inspection/shared';
import { syncManager, QueuedOperation, QueuedMedia, SyncStatus } from '../utils/sync-manager';

export interface SyncDetails {
  operations: number;
  media: number;
  total: number;
  byType: Record<string, number>;
  failedCount: number;
}

export interface SyncItem {
  id: string;
  type: string;
  displayName: string;
  status: SyncStatus;
  progress: number;
  createdAt: string;
  error?: string;
  isMedia: boolean;
}

interface OfflineContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  pendingDetails: SyncDetails | null;
  pendingItems: SyncItem[];
  lastSyncAt: string | null;
  triggerSync: () => Promise<void>;
  retryItem: (id: string, isMedia: boolean) => Promise<void>;
  retryAllFailed: () => Promise<void>;
  clearQueue: () => Promise<void>;
  clearFailed: () => Promise<void>;
  refreshPendingItems: () => Promise<void>;
}

const defaultDetails: SyncDetails = {
  operations: 0,
  media: 0,
  total: 0,
  byType: {},
  failedCount: 0,
};

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  pendingDetails: null,
  pendingItems: [],
  lastSyncAt: null,
  triggerSync: async () => {},
  retryItem: async () => {},
  retryAllFailed: async () => {},
  clearQueue: async () => {},
  clearFailed: async () => {},
  refreshPendingItems: async () => {},
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDetails, setPendingDetails] = useState<SyncDetails | null>(null);
  const [pendingItems, setPendingItems] = useState<SyncItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const syncInProgress = useRef(false);
  const wasOffline = useRef(false);

  // Convert operations and media to unified SyncItem list
  const buildPendingItems = useCallback(async (): Promise<SyncItem[]> => {
    const [operations, media] = await Promise.all([
      syncManager.getPending(),
      syncManager.getPendingMedia(),
    ]);

    const opItems: SyncItem[] = operations.map((op: QueuedOperation) => ({
      id: op.id,
      type: op.type,
      displayName: op.displayName || op.type,
      status: op.status,
      progress: op.progress || (op.status === 'synced' ? 100 : 0),
      createdAt: op.createdAt,
      error: op.error,
      isMedia: false,
    }));

    const mediaItems: SyncItem[] = media.map((m: QueuedMedia) => ({
      id: m.id,
      type: `upload-${m.type}`,
      displayName: `${m.type.charAt(0).toUpperCase() + m.type.slice(1)} Upload`,
      status: m.status,
      progress: m.progress,
      createdAt: m.createdAt,
      error: m.error,
      isMedia: true,
    }));

    // Sort by createdAt descending (newest first)
    return [...opItems, ...mediaItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, []);

  // Refresh pending items list
  const refreshPendingItems = useCallback(async () => {
    const [details, items, lastSync] = await Promise.all([
      syncManager.getPendingDetails(),
      buildPendingItems(),
      syncManager.getLastSyncTime(),
    ]);
    setPendingDetails(details);
    setPendingItems(items);
    setPendingCount(details.total);
    setLastSyncAt(lastSync);
  }, [buildPendingItems]);

  // Load initial state
  useEffect(() => {
    refreshPendingItems();
  }, [refreshPendingItems]);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);

      // Track if we were offline
      if (!online) {
        wasOffline.current = true;
      }

      setIsOnline(online);
    });
    return () => unsubscribe();
  }, []);

  // Sync function
  const triggerSync = useCallback(async () => {
    if (syncInProgress.current || !isOnline) return;
    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      const client = getApiClient();

      // Update items to show syncing state
      await refreshPendingItems();

      // Process operations
      const result = await syncManager.processQueue(client, (id, progress) => {
        setPendingItems(prev =>
          prev.map(item =>
            item.id === id ? { ...item, progress, status: progress === 100 ? 'synced' : 'syncing' } : item
          )
        );
      });

      // Process media uploads (simplified - actual upload logic would be more complex)
      const mediaResult = await syncManager.processMediaQueue(
        client,
        async (media, onProgress) => {
          // This is a placeholder - actual upload would use FormData and axios with onUploadProgress
          const formData = new FormData();
          formData.append('file', {
            uri: media.localUri,
            type: media.type === 'photo' ? 'image/jpeg' : media.type === 'video' ? 'video/mp4' : 'audio/m4a',
            name: `${media.type}_${media.id}`,
          } as unknown as Blob);

          await client.post(`/api/${media.entityType}/${media.entityId}/media`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                onProgress(percent);
              }
            },
          });
        },
        (id, progress) => {
          setPendingItems(prev =>
            prev.map(item =>
              item.id === id ? { ...item, progress, status: progress === 100 ? 'synced' : 'syncing' } : item
            )
          );
        }
      );

      // Refresh state
      await refreshPendingItems();

      // Show notification if we were offline and sync completed
      const totalSuccess = result.success + mediaResult.success;
      if (wasOffline.current && totalSuccess > 0) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Sync Complete',
            body: `${totalSuccess} item${totalSuccess > 1 ? 's' : ''} synced successfully`,
            data: { type: 'sync-complete' },
          },
          trigger: null,
        });
        wasOffline.current = false;
      }

      // Invalidate queries to refresh data after sync
      if (totalSuccess > 0) {
        queryClient.invalidateQueries();
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [isOnline, queryClient, refreshPendingItems]);

  // Retry a single item
  const retryItem = useCallback(async (id: string, isMedia: boolean) => {
    if (isMedia) {
      await syncManager.retryMedia(id);
    } else {
      await syncManager.retryOperation(id);
    }
    await refreshPendingItems();
    triggerSync();
  }, [refreshPendingItems, triggerSync]);

  // Retry all failed items
  const retryAllFailed = useCallback(async () => {
    await syncManager.retryAllFailed();
    await refreshPendingItems();
    triggerSync();
  }, [refreshPendingItems, triggerSync]);

  // Clear entire queue
  const clearQueue = useCallback(async () => {
    await syncManager.clear();
    await refreshPendingItems();
  }, [refreshPendingItems]);

  // Clear only failed items
  const clearFailed = useCallback(async () => {
    await syncManager.clearFailed();
    await refreshPendingItems();
  }, [refreshPendingItems]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      triggerSync();
    }
  }, [isOnline, pendingCount, triggerSync]);

  // Sync when app comes to foreground
  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && isOnline) {
        await refreshPendingItems();
        triggerSync();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [isOnline, triggerSync, refreshPendingItems]);

  // Update pending count periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      await refreshPendingItems();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshPendingItems]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        pendingDetails,
        pendingItems,
        lastSyncAt,
        triggerSync,
        retryItem,
        retryAllFailed,
        clearQueue,
        clearFailed,
        refreshPendingItems,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
