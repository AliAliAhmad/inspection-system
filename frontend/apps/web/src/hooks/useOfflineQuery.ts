/**
 * Offline-aware query hook for web PWA.
 * Provides cached data when offline and caches successful responses.
 */
import { useQuery, UseQueryOptions, UseQueryResult, QueryKey } from '@tanstack/react-query';
import { getCached, setCached } from '../utils/offline-storage';
import { useOffline } from '../providers/OfflineProvider';

interface UseOfflineQueryOptions<TData, TError = unknown>
  extends Omit<UseQueryOptions<TData, TError, TData, QueryKey>, 'queryFn'> {
  queryFn: () => Promise<TData>;
  cacheKey: string;
  cacheTtlMs?: number; // How long to cache (default: 1 hour)
}

/**
 * A query hook that works offline by using IndexedDB cache.
 * When online: fetches from API and caches the result
 * When offline: returns cached data if available
 */
export function useOfflineQuery<TData, TError = unknown>({
  queryFn,
  cacheKey,
  cacheTtlMs = 60 * 60 * 1000, // 1 hour default
  ...options
}: UseOfflineQueryOptions<TData, TError>): UseQueryResult<TData, TError> {
  const { isOnline } = useOffline();

  const wrappedQueryFn = async (): Promise<TData> => {
    if (!isOnline) {
      // Offline: try to get from cache
      const cached = await getCached<TData>(cacheKey);
      if (cached !== null) {
        return cached;
      }
      throw new Error('No cached data available offline');
    }

    // Online: fetch and cache
    try {
      const data = await queryFn();
      // Cache the result
      await setCached(cacheKey, data, cacheTtlMs);
      return data;
    } catch (error) {
      // On fetch error, try to return cached data
      const cached = await getCached<TData>(cacheKey);
      if (cached !== null) {
        console.log('Returning cached data due to fetch error');
        return cached;
      }
      throw error;
    }
  };

  return useQuery<TData, TError>({
    ...options,
    queryFn: wrappedQueryFn,
    // Adjust settings for offline
    retry: isOnline ? (options.retry ?? 1) : 0,
    staleTime: isOnline ? (options.staleTime ?? 30_000) : Infinity,
    // Don't refetch in background when offline
    refetchOnWindowFocus: isOnline ? options.refetchOnWindowFocus : false,
    refetchOnReconnect: true,
  });
}

export default useOfflineQuery;
