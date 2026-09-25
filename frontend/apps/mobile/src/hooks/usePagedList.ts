import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, keepPreviousData, type QueryKey } from '@tanstack/react-query';
import { extractPageMeta, flattenPages, nextPageParam } from '../utils/pagination';

interface UsePagedListOptions {
  /** Include every filter in the key: a new key starts again from page 1. */
  queryKey: QueryKey;
  /** Fetch one page (1-based). Return the axios response as-is. */
  fetchPage: (page: number) => Promise<{ data: any }>;
  enabled?: boolean;
  /** Keep the old rows visible while a new filter loads (default true). */
  keepPrevious?: boolean;
  refetchInterval?: number;
}

/**
 * A list that APPENDS as you scroll.
 *
 * The screens used `setPage(n)` with a plain useQuery keyed on the page, so
 * "load more" swapped page 1 out for page 2 — the rows you had scrolled past
 * vanished. useInfiniteQuery keeps every page; a changed filter is a new
 * queryKey and starts again from page 1 by itself.
 */
export function usePagedList<T = any>({
  queryKey,
  fetchPage,
  enabled = true,
  keepPrevious = true,
  refetchInterval,
}: UsePagedListOptions) {
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam as number).then((r) => r.data),
    getNextPageParam: (lastPage) => nextPageParam(lastPage),
    enabled,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
    refetchInterval,
  });

  const items = useMemo(() => flattenPages<T>(query.data?.pages), [query.data?.pages]);
  const firstPage = query.data?.pages?.[0];
  const total = useMemo(() => {
    const meta = firstPage ? extractPageMeta(firstPage) : null;
    return meta ? Math.max(meta.total, items.length) : items.length;
  }, [firstPage, items.length]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    items,
    total,
    /** The first page's body — for endpoints that put extra fields beside the rows. */
    firstPage,
    loadMore,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    /** Pull-to-refresh spinner: a refetch that is not a next-page fetch. */
    isRefreshing: query.isRefetching && !isFetchingNextPage && !query.isPlaceholderData,
    /** A new filter is loading while the previous rows stay on screen. */
    isSwitching: query.isPlaceholderData && query.isFetching,
    refetch: query.refetch,
  };
}
