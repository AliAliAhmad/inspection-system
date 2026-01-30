import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import { useOffline } from '../providers/OfflineProvider';
import { syncManager, QueuedOperation } from '../utils/sync-manager';
import { Alert } from 'react-native';

interface OfflineMutationOptions<TData, TVariables> extends Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  offlineConfig?: {
    type: QueuedOperation['type'];
    endpoint: string | ((variables: TVariables) => string);
    method: QueuedOperation['method'];
    toPayload?: (variables: TVariables) => Record<string, unknown>;
  };
  invalidateKeys?: string[][];
}

/**
 * useOfflineMutation - A mutation hook that queues operations when offline.
 *
 * When online: executes mutation normally
 * When offline: queues the operation in MMKV for later sync
 */
export function useOfflineMutation<TData = unknown, TVariables = void>(
  options: OfflineMutationOptions<TData, TVariables>,
) {
  const { isOnline } = useOffline();
  const queryClient = useQueryClient();
  const { mutationFn, offlineConfig, invalidateKeys, ...rest } = options;

  return useMutation<TData, Error, TVariables>({
    ...rest,
    mutationFn: async (variables: TVariables) => {
      if (!isOnline && offlineConfig) {
        // Queue for later
        const endpoint = typeof offlineConfig.endpoint === 'function'
          ? offlineConfig.endpoint(variables)
          : offlineConfig.endpoint;

        const payload = offlineConfig.toPayload
          ? offlineConfig.toPayload(variables)
          : (variables as unknown as Record<string, unknown>);

        syncManager.enqueue({
          type: offlineConfig.type,
          endpoint,
          method: offlineConfig.method,
          payload,
        });

        Alert.alert('Queued', 'This action will be synced when you are back online.');

        // Return a fake success response
        return {} as TData;
      }

      return mutationFn(variables);
    },
    onSuccess: (data, variables, context) => {
      // Invalidate queries
      if (invalidateKeys) {
        invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      }
      rest.onSuccess?.(data, variables, context);
    },
  });
}
