import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { getApiClient } from '@inspection/shared';
import { syncManager, QueuedOperation, QueuedMedia, SyncStatus } from '../utils/sync-manager';
import {
  syncPendingMutations,
  getPendingCount as getMutationPendingCount,
} from '../utils/offline-mutations';
import { runStorageCleanup, checkStorageHealth, type StorageHealth } from '../storage/storage-cleanup';

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
  storageHealth: StorageHealth;
  storageWarning: string | null;
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
  storageHealth: 'healthy',
  storageWarning: null,
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
  const [storageHealth, setStorageHealth] = useState<StorageHealth>('healthy');
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
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

  // Refresh pending items list (includes both sync-manager + offline-mutations queues)
  const refreshPendingItems = useCallback(async () => {
    const [details, items, lastSync, mutationCount, inspectionMediaCount] = await Promise.all([
      syncManager.getPendingDetails(),
      buildPendingItems(),
      syncManager.getLastSyncTime(),
      getMutationPendingCount(),
      syncManager.getInspectionMediaCount(),
    ]);
    const newCount = details.total + mutationCount + inspectionMediaCount;
    // Only update state if values actually changed to avoid unnecessary re-renders
    setPendingCount(prev => prev === newCount ? prev : newCount);
    setPendingDetails(prev => JSON.stringify(prev) === JSON.stringify(details) ? prev : details);
    setPendingItems(prev => prev.length === items.length && prev.every((p, i) => p.id === items[i]?.id) ? prev : items);
    setLastSyncAt(prev => prev === lastSync ? prev : lastSync);
  }, [buildPendingItems]);

  // Load initial state + run storage cleanup to prevent SQLite "disk full" errors
  useEffect(() => {
    refreshPendingItems();
    // Cleanup stale cache/drafts/queues in the background (non-blocking)
    runStorageCleanup()
      .then(() => checkStorageHealth())
      .then((result) => {
        setStorageHealth(result.health);
        setStorageWarning(result.message || null);
      })
      .catch(() => {});
  }, [refreshPendingItems]);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // Use isConnected as primary check — isInternetReachable is unreliable on Android emulators
      const online = !!state.isConnected;

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

      // Process media uploads via native FileSystem.uploadAsync
      const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
      const mediaResult = await syncManager.processMediaQueue(
        client,
        async (media, onProgress) => {
          const baseUrl = client.defaults.baseURL || '';
          const authHeader = String(
            client.defaults.headers?.Authorization
            || client.defaults.headers?.common?.Authorization || ''
          );
          const mimeType = media.type === 'photo' ? 'image/jpeg' : media.type === 'video' ? 'video/mp4' : 'audio/m4a';

          const uploadResult = await FileSystem.uploadAsync(
            `${baseUrl}/api/${media.entityType}/${media.entityId}/media`,
            media.localUri,
            {
              httpMethod: 'POST',
              uploadType: FileSystem.FileSystemUploadType.MULTIPART,
              fieldName: 'file',
              mimeType,
              headers: { Authorization: authHeader },
            }
          );

          if (uploadResult.status < 200 || uploadResult.status >= 300) {
            throw new Error(`Upload failed with status ${uploadResult.status}`);
          }
          onProgress(100);
        },
        (id, progress) => {
          setPendingItems(prev =>
            prev.map(item =>
              item.id === id ? { ...item, progress, status: progress === 100 ? 'synced' : 'syncing' } : item
            )
          );
        }
      );

      // Process offline mutation queue (form submissions queued while offline)
      const mutationResult = await syncPendingMutations(client);

      // Process inspection-specific media (photos + voice captured while offline)
      const inspectionMediaResult = await syncManager.processInspectionMediaQueue(client);

      // Refresh state
      await refreshPendingItems();

      // Show notification if we were offline and sync completed
      const totalSuccess = result.success + mediaResult.success + mutationResult.synced + inspectionMediaResult.success;
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

  // Auto-sync when coming back online (use ref to avoid dependency loop)
  const pendingCountRef = useRef(pendingCount);
  pendingCountRef.current = pendingCount;

  useEffect(() => {
    if (isOnline && pendingCountRef.current > 0) {
      triggerSync();
    }
    // Only re-run when online status changes, NOT when pendingCount changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Sync when app comes to foreground
  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && isOnline) {
        await refreshPendingItems();
        if (pendingCountRef.current > 0) {
          triggerSync();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [isOnline, triggerSync, refreshPendingItems]);

  // Update pending count periodically (only when there are pending items)
  useEffect(() => {
    if (pendingCount === 0) return;
    const interval = setInterval(async () => {
      await refreshPendingItems();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshPendingItems, pendingCount]);

  const contextValue = useMemo(
    () => ({
      isOnline,
      isSyncing,
      pendingCount,
      pendingDetails,
      pendingItems,
      lastSyncAt,
      storageHealth,
      storageWarning,
      triggerSync,
      retryItem,
      retryAllFailed,
      clearQueue,
      clearFailed,
      refreshPendingItems,
    }),
    [
      isOnline,
      isSyncing,
      pendingCount,
      pendingDetails,
      pendingItems,
      lastSyncAt,
      storageHealth,
      storageWarning,
      triggerSync,
      retryItem,
      retryAllFailed,
      clearQueue,
      clearFailed,
      refreshPendingItems,
    ]
  );

  return (
    <OfflineContext.Provider value={contextValue}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
