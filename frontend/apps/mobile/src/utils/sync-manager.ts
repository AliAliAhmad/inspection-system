import { MMKV } from 'react-native-mmkv';

const queueStorage = new MMKV({ id: 'sync-queue' });
const QUEUE_KEY = 'pending-operations';

export interface QueuedOperation {
  id: string;
  type: 'answer-question' | 'submit-inspection' | 'start-job' | 'complete-job' | 'pause-job' | 'mark-incomplete' | 'request-leave';
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

function getQueue(): QueuedOperation[] {
  const raw = queueStorage.getString(QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

function saveQueue(queue: QueuedOperation[]): void {
  queueStorage.set(QUEUE_KEY, JSON.stringify(queue));
}

export const syncManager = {
  // Add an operation to the queue
  enqueue(op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount'>): void {
    const queue = getQueue();
    queue.push({
      ...op,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    });
    saveQueue(queue);
  },

  // Get all pending operations
  getPending(): QueuedOperation[] {
    return getQueue();
  },

  // Get count of pending operations
  getPendingCount(): number {
    return getQueue().length;
  },

  // Remove a completed operation
  dequeue(id: string): void {
    const queue = getQueue().filter(op => op.id !== id);
    saveQueue(queue);
  },

  // Increment retry count for a failed operation
  markRetry(id: string): void {
    const queue = getQueue().map(op =>
      op.id === id ? { ...op, retryCount: op.retryCount + 1 } : op
    );
    saveQueue(queue);
  },

  // Remove operations that have failed too many times (max 5 retries)
  pruneStale(): void {
    const queue = getQueue().filter(op => op.retryCount < 5);
    saveQueue(queue);
  },

  // Clear all queued operations
  clear(): void {
    queueStorage.delete(QUEUE_KEY);
  },

  // Process the queue sequentially using the API client
  async processQueue(apiClient: import('axios').AxiosInstance): Promise<{ success: number; failed: number }> {
    const queue = getQueue();
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
        syncManager.dequeue(op.id);
        success++;
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // Don't retry 4xx errors (except 408/429)
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          syncManager.dequeue(op.id);
          failed++;
        } else {
          syncManager.markRetry(op.id);
          failed++;
        }
      }
    }

    syncManager.pruneStale();
    return { success, failed };
  },
};
