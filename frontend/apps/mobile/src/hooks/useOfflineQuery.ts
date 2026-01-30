import { useQuery, UseQueryOptions, QueryKey } from '@tanstack/react-query';
import { useOffline } from '../providers/OfflineProvider';
import { offlineCache } from '../storage/offline-cache';

/**
 * useOfflineQuery - A query hook that falls back to MMKV cache when offline.
 *
 * When online: fetches normally and caches result in MMKV
 * When offline: returns cached data from MMKV
 */
export function useOfflineQuery<TData = unknown>(
  options: UseQueryOptions<TData, Error, TData, QueryKey> & { cacheKey: string },
) {
  const { isOnline } = useOffline();
  const { cacheKey, queryFn, ...rest } = options;

  return useQuery<TData, Error, TData, QueryKey>({
    ...rest,
    queryFn: async (context) => {
      if (!isOnline) {
        const cached = offlineCache.get<TData>(cacheKey);
        if (cached) return cached;
        throw new Error('No cached data available offline');
      }

      // Fetch from API
      const data = typeof queryFn === 'function' ? await queryFn(context) : await queryFn;

      // Cache the result
      offlineCache.set(cacheKey, data);

      return data;
    },
    // When offline, don't retry and use stale data
    retry: isOnline ? 3 : 0,
    staleTime: isOnline ? undefined : Infinity,
    ...(rest as object),
  });
}
