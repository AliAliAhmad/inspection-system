import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'sync-queue:pending-operations';
const MEDIA_QUEUE_KEY = 'sync-queue:pending-media';
const LAST_SYNC_KEY = 'sync-queue:last-sync';
const INSPECTION_MEDIA_QUEUE_KEY = 'sync-queue:pending-inspection-media';

export type OperationType =
  | 'answer-question'
  | 'submit-inspection'
  | 'submit-verdict'
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

// Inspection-specific media queue — photo and voice captured offline during inspections
export interface QueuedInspectionMedia {
  id: string;
  mediaType: 'photo' | 'voice';
  localUri: string;         // permanent path under FileSystem.documentDirectory
  inspectionId: number;
  checklistItemId: number;
  assignmentId: string;
  fileName: string;
  language?: string;        // 'en' | 'ar' — for voice transcription
  answerValue?: string;     // current answer at capture time — needed to re-link voice note
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

async function getInspectionMediaQueue(): Promise<QueuedInspectionMedia[]> {
  const raw = await AsyncStorage.getItem(INSPECTION_MEDIA_QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

async function saveInspectionMediaQueue(queue: QueuedInspectionMedia[]): Promise<void> {
  await AsyncStorage.setItem(INSPECTION_MEDIA_QUEUE_KEY, JSON.stringify(queue));
}

function getOperationDisplayName(op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount' | 'status'>): string {
  const typeLabels: Record<OperationType, string> = {
    'answer-question': 'Answer',
    'submit-inspection': 'Inspection',
    'submit-verdict': 'Submit Verdict',
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

/**
 * Smart Conflict Resolution for offline sync.
 *
 * Rule: fail/defect always wins over pass — safer to flag defects.
 * Returns true if we should send our (local) answer, false to keep the server's answer.
 */
function shouldOverrideServerAnswer(ourValue: string, serverValue: string): boolean {
  const ourLower = (ourValue || '').toLowerCase().trim();
  const serverLower = (serverValue || '').toLowerCase().trim();

  // Same answer — send ours (updates timestamp)
  if (ourLower === serverLower) return true;

  // Fail/no always wins
  const failValues = ['fail', 'no', 'stop', 'stopped', 'faulty'];
  const ourIsFail = failValues.includes(ourLower);
  const serverIsFail = failValues.includes(serverLower);

  // Our answer is fail → always override
  if (ourIsFail) return true;

  // Server answer is fail and ours is not → keep server's
  if (serverIsFail && !ourIsFail) return false;

  // Neither is fail → last sync wins (send ours)
  return true;
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

      // ── Smart Conflict Resolution for answer-question operations ──
      // Rule: fail/no always wins over pass/yes. Never delete data.
      if (op.type === 'answer-question' && op.payload) {
        try {
          const inspectionId = op.endpoint.match(/\/api\/inspections\/(\d+)\/answer/)?.[1];
          if (inspectionId) {
            const currentRes = await apiClient.get(`/api/inspections/${inspectionId}`);
            const currentData = (currentRes.data as Record<string, unknown>)?.data ?? currentRes.data;
            const answers = ((currentData as Record<string, unknown>)?.answers ?? []) as Array<Record<string, unknown>>;
            const existingAnswer = answers.find(
              (a) => a.checklist_item_id === op.payload.checklist_item_id
            );
            if (existingAnswer?.answer_value && op.payload.answer_value) {
              if (!shouldOverrideServerAnswer(
                String(op.payload.answer_value),
                String(existingAnswer.answer_value)
              )) {
                // Server's "fail" answer takes priority — skip this operation
                if (__DEV__) console.log(
                  `Conflict resolved: keeping server "fail" answer for item ${op.payload.checklist_item_id}`
                );
                await syncManager.dequeue(op.id);
                success++;
                continue;
              }
            }
          }
        } catch {
          // If we can't check, just proceed with sending (fail-safe)
        }
      }

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

  // ─── Inspection media queue (photo + voice captured offline) ────────────────

  async enqueueInspectionMedia(
    item: Omit<QueuedInspectionMedia, 'id' | 'createdAt' | 'status' | 'progress' | 'retryCount'>
  ): Promise<string> {
    const queue = await getInspectionMediaQueue();
    const id = `insp-media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    queue.push({ ...item, id, createdAt: new Date().toISOString(), status: 'pending', progress: 0, retryCount: 0 });
    await saveInspectionMediaQueue(queue);
    return id;
  },

  async getPendingInspectionMedia(): Promise<QueuedInspectionMedia[]> {
    return getInspectionMediaQueue();
  },

  async getInspectionMediaCount(): Promise<number> {
    return (await getInspectionMediaQueue()).length;
  },

  async dequeueInspectionMedia(id: string): Promise<void> {
    await saveInspectionMediaQueue((await getInspectionMediaQueue()).filter(m => m.id !== id));
  },

  async markInspectionMediaRetry(id: string, error?: string): Promise<void> {
    const queue = (await getInspectionMediaQueue()).map(m =>
      m.id === id ? { ...m, retryCount: m.retryCount + 1, status: 'failed' as SyncStatus, error } : m
    );
    await saveInspectionMediaQueue(queue);
  },

  async pruneStaleInspectionMedia(): Promise<void> {
    await saveInspectionMediaQueue((await getInspectionMediaQueue()).filter(m => m.retryCount < 5));
  },

  // Process inspection-specific media queue (called from OfflineProvider.triggerSync)
  async processInspectionMediaQueue(
    apiClient: import('axios').AxiosInstance
  ): Promise<{ success: number; failed: number }> {
    // Lazy-load FileSystem to avoid import issues at module level
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

    const queue = await getInspectionMediaQueue();
    let success = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        const base64 = await FileSystem.readAsStringAsync(item.localUri, { encoding: 'base64' });

        if (item.mediaType === 'photo') {
          // Upload photo — backend auto-links file to InspectionAnswer and runs AI analysis
          await apiClient.post(
            `/api/inspections/${item.inspectionId}/upload-media`,
            { file_base64: base64, file_name: item.fileName, file_type: 'image/jpeg', checklist_item_id: item.checklistItemId },
            { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
          );
        } else {
          // Upload voice — transcribe then link to the answer
          const response = await apiClient.post(
            '/api/voice/transcribe',
            { audio_base64: base64, file_name: item.fileName, file_type: 'audio/m4a', language: item.language || 'en' },
            { headers: { 'Content-Type': 'application/json' }, timeout: 180000 }
          );
          const result = (response.data as any)?.data;
          if (result?.audio_file?.id && item.answerValue !== undefined) {
            // Re-patch the answer to link voice_note_id (upsert endpoint)
            await apiClient.post(`/api/inspections/${item.inspectionId}/answer`, {
              checklist_item_id: item.checklistItemId,
              answer_value: item.answerValue,
              voice_note_id: result.audio_file.id,
              voice_transcription: { en: result.en || '', ar: result.ar || '' },
            });
          }
        }

        await syncManager.dequeueInspectionMedia(item.id);
        // Clean up local file after successful upload
        FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch(() => {});
        success++;
      } catch (error: unknown) {
        await syncManager.markInspectionMediaRetry(item.id, (error as { message?: string })?.message);
        failed++;
      }
    }

    await syncManager.pruneStaleInspectionMedia();
    if (success > 0) await syncManager.setLastSyncTime(new Date().toISOString());
    return { success, failed };
  },

  // ─── End inspection media queue ──────────────────────────────────────────────

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
