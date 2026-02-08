/**
 * Offline-aware mutation hook for web PWA.
 * Queues mutations when offline and syncs when back online.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { enqueueSyncOperation } from '../utils/offline-storage';
import { useOffline } from '../providers/OfflineProvider';

interface UseOfflineMutationOptions<TData, TVariables> {
  // The actual mutation function to call when online
  mutationFn: (variables: TVariables) => Promise<TData>;
  // Info needed to replay the mutation when back online
  operationType: string;
  getEndpoint: (variables: TVariables) => string;
  method?: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  // Keys to invalidate on success
  invalidateKeys?: string[];
  // Optional: transform variables to payload
  getPayload?: (variables: TVariables) => unknown;
  // Optional: generate optimistic response for offline
  getOptimisticResponse?: (variables: TVariables) => TData;
  // Message to show when queued offline
  offlineMessage?: string;
  // Callbacks
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}

/**
 * A mutation hook that works offline by queuing operations.
 * When online: executes mutation normally
 * When offline: queues the operation for later sync
 */
export function useOfflineMutation<TData = unknown, TVariables = void>({
  mutationFn,
  operationType,
  getEndpoint,
  method = 'POST',
  invalidateKeys,
  getPayload,
  getOptimisticResponse,
  offlineMessage = 'This action will be synced when you are back online',
  onSuccess,
  onError,
}: UseOfflineMutationOptions<TData, TVariables>) {
  const { isOnline } = useOffline();
  const queryClient = useQueryClient();

  const wrappedMutationFn = async (variables: TVariables): Promise<TData> => {
    if (!isOnline) {
      // Offline: queue the operation
      const endpoint = getEndpoint(variables);
      const payload = getPayload ? getPayload(variables) : variables;

      await enqueueSyncOperation({
        type: operationType,
        endpoint,
        method,
        payload,
      });

      message.info(offlineMessage);

      // Return optimistic response if provided
      if (getOptimisticResponse) {
        return getOptimisticResponse(variables);
      }

      // Return a fake success response
      return { success: true, queued: true } as TData;
    }

    // Online: execute normally
    return mutationFn(variables);
  };

  return useMutation({
    mutationFn: wrappedMutationFn,
    onSuccess: (data, variables) => {
      // Invalidate queries on success
      if (invalidateKeys && isOnline) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }

      // Call original onSuccess
      onSuccess?.(data, variables);
    },
    onError: (error: Error, variables) => {
      onError?.(error, variables);
    },
  });
}

export default useOfflineMutation;
