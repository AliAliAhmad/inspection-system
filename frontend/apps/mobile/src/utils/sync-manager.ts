import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'sync-queue:pending-operations';
const MEDIA_QUEUE_KEY = 'sync-queue:pending-media';
const LAST_SYNC_KEY = 'sync-queue:last-sync';

export type OperationType =
  | 'answer-question'
  | 'submit-inspection'
  | 'start-job'
  | 'complete-job'
  | 'pause-job'
  | 'mark-incomplete'
  | 'request-leave'
  | 'request-pause'
  | 'assess-defect'
  | 'upload-cleaning'
  | 'upload-photo'
  | 'upload-video'
  | 'upload-voice';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface QueuedOperation {
  id: string;
  type: OperationType;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  status: SyncStatus;
  progress?: number; // 0-100 for uploads
  error?: string;
  displayName?: string; // Human-readable description
}

export interface QueuedMedia {
  id: string;
  type: 'photo' | 'video' | 'voice';
  localUri: string;
  entityType: string; // e.g., 'inspection', 'job', 'defect'
  entityId: string;
  createdAt: string;
  status: SyncStatus;
  progress: number;
  retryCount: number;
  error?: string;
}

export interface SyncResult {
  success: number;
  failed: number;
  operations: QueuedOperation[];
}

export type SyncProgressCallback = (operationId: string, progress: number) => void;

async function getQueue(): Promise<QueuedOperation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

async function saveQueue(queue: QueuedOperation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function getMediaQueue(): Promise<QueuedMedia[]> {
  const raw = await AsyncStorage.getItem(MEDIA_QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

async function saveMediaQueue(queue: QueuedMedia[]): Promise<void> {
  await AsyncStorage.setItem(MEDIA_QUEUE_KEY, JSON.stringify(queue));
}

function getOperationDisplayName(op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount' | 'status'>): string {
  const typeLabels: Record<OperationType, string> = {
    'answer-question': 'Answer',
    'submit-inspection': 'Inspection',
    'start-job': 'Start Job',
    'complete-job': 'Complete Job',
    'pause-job': 'Pause Job',
    'mark-incomplete': 'Mark Incomplete',
    'request-leave': 'Leave Request',
    'request-pause': 'Pause Request',
    'assess-defect': 'Defect Assessment',
    'upload-cleaning': 'Cleaning Upload',
    'upload-photo': 'Photo',
    'upload-video': 'Video',
    'upload-voice': 'Voice Note',
  };
  return typeLabels[op.type] || op.type;
}

export const syncManager = {
  // Add an operation to the queue
  async enqueue(op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<string> {
    const queue = await getQueue();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    queue.push({
      ...op,
      id,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
      displayName: op.displayName || getOperationDisplayName(op),
    });
    await saveQueue(queue);
    return id;
  },

  // Add media to upload queue
  async enqueueMedia(media: Omit<QueuedMedia, 'id' | 'createdAt' | 'status' | 'progress' | 'retryCount'>): Promise<string> {
    const queue = await getMediaQueue();
    const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    queue.push({
      ...media,
      id,
      createdAt: new Date().toISOString(),
      status: 'pending',
      progress: 0,
      retryCount: 0,
    });
    await saveMediaQueue(queue);
    return id;
  },

  // Get all pending operations
  async getPending(): Promise<QueuedOperation[]> {
    return getQueue();
  },

  // Get all pending media
  async getPendingMedia(): Promise<QueuedMedia[]> {
    return getMediaQueue();
  },

  // Get combined count of pending operations and media
  async getPendingCount(): Promise<number> {
    const [ops, media] = await Promise.all([getQueue(), getMediaQueue()]);
    return ops.length + media.length;
  },

  // Get detailed pending counts
  async getPendingDetails(): Promise<{
    operations: number;
    media: number;
    total: number;
    byType: Record<string, number>;
    failedCount: number;
  }> {
    const [ops, media] = await Promise.all([getQueue(), getMediaQueue()]);
    const byType: Record<string, number> = {};
    let failedCount = 0;

    ops.forEach(op => {
      byType[op.type] = (byType[op.type] || 0) + 1;
      if (op.status === 'failed') failedCount++;
    });
    media.forEach(m => {
      const key = `upload-${m.type}`;
      byType[key] = (byType[key] || 0) + 1;
      if (m.status === 'failed') failedCount++;
    });

    return {
      operations: ops.length,
      media: media.length,
      total: ops.length + media.length,
      byType,
      failedCount,
    };
  },

  // Get last successful sync timestamp
  async getLastSyncTime(): Promise<string | null> {
    return AsyncStorage.getItem(LAST_SYNC_KEY);
  },

  // Update last sync time
  async setLastSyncTime(time: string): Promise<void> {
    await AsyncStorage.setItem(LAST_SYNC_KEY, time);
  },

  // Update operation status
  async updateOperationStatus(id: string, status: SyncStatus, error?: string): Promise<void> {
    const queue = (await getQueue()).map(op =>
      op.id === id ? { ...op, status, error } : op
    );
    await saveQueue(queue);
  },

  // Update media status and progress
  async updateMediaStatus(id: string, status: SyncStatus, progress?: number, error?: string): Promise<void> {
    const queue = (await getMediaQueue()).map(m =>
      m.id === id ? { ...m, status, progress: progress ?? m.progress, error } : m
    );
    await saveMediaQueue(queue);
  },

  // Remove a completed operation
  async dequeue(id: string): Promise<void> {
    const queue = (await getQueue()).filter(op => op.id !== id);
    await saveQueue(queue);
  },

  // Remove completed media
  async dequeueMedia(id: string): Promise<void> {
    const queue = (await getMediaQueue()).filter(m => m.id !== id);
    await saveMediaQueue(queue);
  },

  // Increment retry count for a failed operation
  async markRetry(id: string, error?: string): Promise<void> {
    const queue = (await getQueue()).map(op =>
      op.id === id ? { ...op, retryCount: op.retryCount + 1, status: 'failed' as SyncStatus, error } : op
    );
    await saveQueue(queue);
  },

  // Mark media retry
  async markMediaRetry(id: string, error?: string): Promise<void> {
    const queue = (await getMediaQueue()).map(m =>
      m.id === id ? { ...m, retryCount: m.retryCount + 1, status: 'failed' as SyncStatus, error } : m
    );
    await saveMediaQueue(queue);
  },

  // Retry a specific failed operation
  async retryOperation(id: string): Promise<void> {
    const queue = (await getQueue()).map(op =>
      op.id === id ? { ...op, status: 'pending' as SyncStatus, error: undefined } : op
    );
    await saveQueue(queue);
  },

  // Retry a specific failed media upload
  async retryMedia(id: string): Promise<void> {
    const queue = (await getMediaQueue()).map(m =>
      m.id === id ? { ...m, status: 'pending' as SyncStatus, progress: 0, error: undefined } : m
    );
    await saveMediaQueue(queue);
  },

  // Retry all failed items
  async retryAllFailed(): Promise<void> {
    const [ops, media] = await Promise.all([getQueue(), getMediaQueue()]);

    const updatedOps = ops.map(op =>
      op.status === 'failed' ? { ...op, status: 'pending' as SyncStatus, error: undefined } : op
    );
    const updatedMedia = media.map(m =>
      m.status === 'failed' ? { ...m, status: 'pending' as SyncStatus, progress: 0, error: undefined } : m
    );

    await Promise.all([saveQueue(updatedOps), saveMediaQueue(updatedMedia)]);
  },

  // Remove operations that have failed too many times (max 5 retries)
  async pruneStale(): Promise<void> {
    const [ops, media] = await Promise.all([getQueue(), getMediaQueue()]);
    await Promise.all([
      saveQueue(ops.filter(op => op.retryCount < 5)),
      saveMediaQueue(media.filter(m => m.retryCount < 5)),
    ]);
  },

  // Clear all queued operations
  async clear(): Promise<void> {
    await Promise.all([
      AsyncStorage.removeItem(QUEUE_KEY),
      AsyncStorage.removeItem(MEDIA_QUEUE_KEY),
    ]);
  },

  // Clear only failed items
  async clearFailed(): Promise<void> {
    const [ops, media] = await Promise.all([getQueue(), getMediaQueue()]);
    await Promise.all([
      saveQueue(ops.filter(op => op.status !== 'failed')),
      saveMediaQueue(media.filter(m => m.status !== 'failed')),
    ]);
  },

  // Process the queue sequentially using the API client
  async processQueue(
    apiClient: import('axios').AxiosInstance,
    onProgress?: SyncProgressCallback
  ): Promise<SyncResult> {
    const queue = await getQueue();
    let success = 0;
    let failed = 0;

    for (const op of queue) {
      // Update status to syncing
      await syncManager.updateOperationStatus(op.id, 'syncing');

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
        onProgress?.(op.id, 100);
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        const errorMessage = (error as { message?: string })?.message || 'Sync failed';

        // Don't retry 4xx errors (except 408/429)
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          await syncManager.updateOperationStatus(op.id, 'failed', `Error ${status}: ${errorMessage}`);
          await syncManager.dequeue(op.id);
          failed++;
        } else {
          await syncManager.markRetry(op.id, errorMessage);
          failed++;
        }
      }
    }

    await syncManager.pruneStale();

    if (success > 0) {
      await syncManager.setLastSyncTime(new Date().toISOString());
    }

    const updatedQueue = await getQueue();
    return { success, failed, operations: updatedQueue };
  },

  // Process media uploads with progress
  async processMediaQueue(
    apiClient: import('axios').AxiosInstance,
    uploadFn: (media: QueuedMedia, onProgress: (progress: number) => void) => Promise<void>,
    onProgress?: SyncProgressCallback
  ): Promise<{ success: number; failed: number }> {
    const queue = await getMediaQueue();
    let success = 0;
    let failed = 0;

    for (const media of queue) {
      await syncManager.updateMediaStatus(media.id, 'syncing', 0);

      try {
        await uploadFn(media, async (progress) => {
          await syncManager.updateMediaStatus(media.id, 'syncing', progress);
          onProgress?.(media.id, progress);
        });
        await syncManager.dequeueMedia(media.id);
        success++;
        onProgress?.(media.id, 100);
      } catch (error: unknown) {
        const errorMessage = (error as { message?: string })?.message || 'Upload failed';
        await syncManager.markMediaRetry(media.id, errorMessage);
        failed++;
      }
    }

    await syncManager.pruneStale();

    if (success > 0) {
      await syncManager.setLastSyncTime(new Date().toISOString());
    }

    return { success, failed };
  },
};
