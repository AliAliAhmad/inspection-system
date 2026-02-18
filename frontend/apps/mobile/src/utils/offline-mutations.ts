import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'offline_mutations';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type MutationType =
  | 'inspection_answer'
  | 'assessment_verdict'
  | 'quick_report'
  | 'handover'
  | 'voice_message';

export interface PendingMutation {
  id: string;
  type: MutationType;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  payload: any;
  files?: { field: string; uri: string; type: string }[];
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
}

// ──────────────────────────────────────────────────────────────
// Storage helpers
// ──────────────────────────────────────────────────────────────

async function loadQueue(): Promise<PendingMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingMutation[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: PendingMutation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

function generateId(): string {
  return `mut_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Add a new mutation to the offline queue.
 * Returns the generated mutation ID.
 */
export async function queueMutation(
  mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retryCount'>
): Promise<string> {
  const queue = await loadQueue();
  const id = generateId();

  const entry: PendingMutation = {
    ...mutation,
    id,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  queue.push(entry);
  await saveQueue(queue);
  return id;
}

/**
 * Returns all pending mutations ordered by creation time (oldest first).
 */
export async function getPendingMutations(): Promise<PendingMutation[]> {
  const queue = await loadQueue();
  return queue.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Removes a single mutation from the queue (e.g. after successful sync).
 */
export async function removeMutation(id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((m) => m.id !== id));
}

/**
 * Returns the number of pending mutations (for badge display).
 */
export async function getPendingCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

/**
 * Process all queued mutations using the provided axios-compatible client.
 *
 * For each mutation:
 *  1. If files exist, build a FormData and POST/PUT/PATCH as multipart.
 *  2. Otherwise, send the JSON payload directly.
 *  3. On success: remove from queue.
 *  4. On failure: increment retryCount, save lastError, continue to next.
 *
 * Mutations that have failed 10+ times are automatically pruned.
 */
export async function syncPendingMutations(
  apiClient: import('axios').AxiosInstance
): Promise<SyncResult> {
  const queue = await getPendingMutations();
  let synced = 0;
  let failed = 0;

  for (const mutation of queue) {
    try {
      if (mutation.files && mutation.files.length > 0) {
        // ── Upload files via multipart/form-data ──
        const formData = new FormData();

        for (const file of mutation.files) {
          const fileName = file.uri.split('/').pop() || `file_${Date.now()}`;
          formData.append(file.field, {
            uri: file.uri,
            type: file.type,
            name: fileName,
          } as unknown as Blob);
        }

        // Append the JSON payload fields
        if (mutation.payload && typeof mutation.payload === 'object') {
          Object.entries(mutation.payload).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              formData.append(
                key,
                typeof value === 'object' ? JSON.stringify(value) : String(value)
              );
            }
          });
        }

        await sendRequest(apiClient, mutation.method, mutation.endpoint, formData, {
          'Content-Type': 'multipart/form-data',
        });
      } else {
        // ── Plain JSON request ──
        await sendRequest(apiClient, mutation.method, mutation.endpoint, mutation.payload);
      }

      // Success -- remove from queue
      await removeMutation(mutation.id);
      synced++;
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error);
      const httpStatus = extractHttpStatus(error);

      // For 4xx errors (except 408 timeout / 429 rate-limit), don't retry
      if (httpStatus && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429) {
        await removeMutation(mutation.id);
        failed++;
        continue;
      }

      // Increment retry and save error
      await markFailed(mutation.id, errorMessage);
      failed++;
    }
  }

  // Prune mutations that have exceeded max retry count
  await pruneStale();

  return { synced, failed };
}

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

async function markFailed(id: string, errorMessage: string): Promise<void> {
  const queue = await loadQueue();
  const updated = queue.map((m) =>
    m.id === id
      ? { ...m, retryCount: m.retryCount + 1, lastError: errorMessage }
      : m
  );
  await saveQueue(updated);
}

async function pruneStale(): Promise<void> {
  const MAX_RETRIES = 10;
  const queue = await loadQueue();
  const filtered = queue.filter((m) => m.retryCount < MAX_RETRIES);
  if (filtered.length !== queue.length) {
    await saveQueue(filtered);
  }
}

function sendRequest(
  client: import('axios').AxiosInstance,
  method: 'POST' | 'PUT' | 'PATCH',
  endpoint: string,
  data: any,
  headers?: Record<string, string>
): Promise<any> {
  const config = headers ? { headers } : undefined;

  switch (method) {
    case 'POST':
      return client.post(endpoint, data, config);
    case 'PUT':
      return client.put(endpoint, data, config);
    case 'PATCH':
      return client.patch(endpoint, data, config);
    default:
      return client.post(endpoint, data, config);
  }
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as { message: string }).message;
  }
  return 'Unknown sync error';
}

function extractHttpStatus(error: unknown): number | null {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as any).response?.status
  ) {
    return (error as any).response.status;
  }
  return null;
}
