import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'sync-queue:pending-operations';

export interface QueuedOperation {
  id: string;
  type: 'answer-question' | 'submit-inspection' | 'start-job' | 'complete-job' | 'pause-job' | 'mark-incomplete' | 'request-leave';
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

async function getQueue(): Promise<QueuedOperation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

async function saveQueue(queue: QueuedOperation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export const syncManager = {
  // Add an operation to the queue
  async enqueue(op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
    const queue = await getQueue();
    queue.push({
      ...op,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    });
    await saveQueue(queue);
  },

  // Get all pending operations
  async getPending(): Promise<QueuedOperation[]> {
    return getQueue();
  },

  // Get count of pending operations
  async getPendingCount(): Promise<number> {
    const queue = await getQueue();
    return queue.length;
  },

  // Remove a completed operation
  async dequeue(id: string): Promise<void> {
    const queue = (await getQueue()).filter(op => op.id !== id);
    await saveQueue(queue);
  },

  // Increment retry count for a failed operation
  async markRetry(id: string): Promise<void> {
    const queue = (await getQueue()).map(op =>
      op.id === id ? { ...op, retryCount: op.retryCount + 1 } : op
    );
    await saveQueue(queue);
  },

  // Remove operations that have failed too many times (max 5 retries)
  async pruneStale(): Promise<void> {
    const queue = (await getQueue()).filter(op => op.retryCount < 5);
    await saveQueue(queue);
  },

  // Clear all queued operations
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  },

  // Process the queue sequentially using the API client
  async processQueue(apiClient: import('axios').AxiosInstance): Promise<{ success: number; failed: number }> {
    const queue = await getQueue();
    let success = 0;
    let failed = 0;

    for (const op of queue) {
      try {
        if (op.method === 'POST') {
          await apiClient.post(op.endpoint, op.payload);
        } else if (op.method === 'PUT') {
          await apiClient.put(op.endpoint, op.payload);
        } else if (op.method === 'DELETE') {
          await apiClient.delete(op.endpoint);
        }
        await syncManager.dequeue(op.id);
        success++;
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // Don't retry 4xx errors (except 408/429)
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          await syncManager.dequeue(op.id);
          failed++;
        } else {
          await syncManager.markRetry(op.id);
          failed++;
        }
      }
    }

    await syncManager.pruneStale();
    return { success, failed };
  },
};
