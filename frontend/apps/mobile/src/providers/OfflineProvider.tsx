import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@inspection/shared';
import { syncManager } from '../utils/sync-manager';

interface OfflineContextValue {
  isOnline: boolean;
  issyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  issyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  triggerSync: async () => {},
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(syncManager.getPendingCount());
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const syncInProgress = useRef(false);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
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
      const result = await syncManager.processQueue(client);
      setPendingCount(syncManager.getPendingCount());
      setLastSyncAt(new Date().toISOString());

      // Invalidate queries to refresh data after sync
      if (result.success > 0) {
        queryClient.invalidateQueries();
      }
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [isOnline, queryClient]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      triggerSync();
    }
  }, [isOnline, pendingCount, triggerSync]);

  // Sync when app comes to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isOnline) {
        setPendingCount(syncManager.getPendingCount());
        triggerSync();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [isOnline, triggerSync]);

  // Update pending count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPendingCount(syncManager.getPendingCount());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <OfflineContext.Provider value={{ isOnline, issyncing: isSyncing, pendingCount, lastSyncAt, triggerSync }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
