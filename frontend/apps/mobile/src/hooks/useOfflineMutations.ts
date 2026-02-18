import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getApiClient } from '@inspection/shared';
import {
  queueMutation as queueMutationFn,
  getPendingCount,
  syncPendingMutations,
  PendingMutation,
  SyncResult,
} from '../utils/offline-mutations';

/**
 * useOfflineMutations
 *
 * Manages the offline mutation queue lifecycle:
 *  - Detects connectivity via NetInfo
 *  - Auto-syncs when connection is restored
 *  - Exposes pendingCount for badge display
 *  - Exposes queueMutation for components to enqueue work
 *  - Exposes syncNow for manual retry
 */
export function useOfflineMutations() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInProgress = useRef(false);
  const wasOffline = useRef(false);

  // ── Refresh the pending count ──
  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // ── Queue a new mutation ──
  const queueMutation = useCallback(
    async (mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retryCount'>): Promise<string> => {
      const id = await queueMutationFn(mutation);
      await refreshCount();
      return id;
    },
    [refreshCount]
  );

  // ── Sync all pending mutations ──
  const syncNow = useCallback(async (): Promise<SyncResult> => {
    if (syncInProgress.current) {
      return { synced: 0, failed: 0 };
    }

    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      const client = getApiClient();
      const result = await syncPendingMutations(client);
      await refreshCount();
      return result;
    } catch (error) {
      console.error('[useOfflineMutations] syncNow error:', error);
      return { synced: 0, failed: 0 };
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [refreshCount]);

  // ── Monitor connectivity & auto-sync on reconnect ──
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);

      if (!online) {
        wasOffline.current = true;
        return;
      }

      // We just came back online -- trigger auto-sync
      if (wasOffline.current && online) {
        wasOffline.current = false;
        syncNow();
      }
    });

    return () => unsubscribe();
  }, [syncNow]);

  // ── Load initial count on mount ──
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // ── Periodically refresh count (every 10 s) ──
  useEffect(() => {
    const interval = setInterval(refreshCount, 10_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  return {
    queueMutation,
    pendingCount,
    isSyncing,
    syncNow,
  };
}
