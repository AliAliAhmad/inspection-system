import { useQuery, UseQueryOptions, UseQueryResult, QueryKey } from '@tanstack/react-query';
import { useOffline } from '../providers/OfflineProvider';
import { offlineCache } from '../storage/offline-cache';

interface UseOfflineQueryOptions<TData> extends Omit<UseQueryOptions<TData, Error, TData, QueryKey>, 'queryFn'> {
  queryFn: () => Promise<TData>;
  cacheKey: string;
}

/**
 * useOfflineQuery - A query hook that falls back to AsyncStorage cache when offline.
 *
 * When online: fetches normally and caches result in AsyncStorage
 * When offline: returns cached data from AsyncStorage
 */
export function useOfflineQuery<TData>(
  options: UseOfflineQueryOptions<TData>,
): UseQueryResult<TData, Error> {
  const { isOnline } = useOffline();
  const { cacheKey, queryFn, ...rest } = options;

  return useQuery<TData, Error>({
    ...rest,
    queryFn: async () => {
      if (!isOnline) {
        const cached = await offlineCache.get<TData>(cacheKey);
        if (cached) return cached;
        throw new Error('No cached data available offline');
      }

      // Fetch from API
      const data = await queryFn();

      // Cache the result
      await offlineCache.set(cacheKey, data);

      return data;
    },
    // When offline, don't retry and use stale data
    retry: isOnline ? 3 : 0,
    staleTime: isOnline ? undefined : Infinity,
  });
}
