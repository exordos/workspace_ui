/**
 * Visibility-driven read batching for chat messages.
 *
 * Collects unread message ids from viewport events and sends a debounced
 * mark-as-read request with deduplicated ids.
 */

export interface MarkAsReadBatcherOptions {
  markAsRead: (messageIds: number[]) => Promise<unknown>;
  onMarked?: (messageIds: number[]) => void;
  onError?: (error: unknown, messageIds: number[]) => void;
  debounceMs?: number;
}

export interface MarkAsReadBatcher {
  schedule: (messageIds: number[]) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

const DEFAULT_DEBOUNCE_MS = 250;

function normalizeMessageIds(messageIds: number[]): number[] {
  return messageIds.filter((id) => Number.isInteger(id) && id > 0);
}

export function createMarkAsReadBatcher(options: MarkAsReadBatcherOptions): MarkAsReadBatcher {
  const { markAsRead, onMarked, onError, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const queued = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  const scheduleFlush = () => {
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      void flushInternal();
    }, debounceMs);
  };

  const flushInternal = async () => {
    if (inFlight || queued.size === 0) return;
    const batch = Array.from(queued);
    queued.clear();
    inFlight = true;
    try {
      await markAsRead(batch);
      onMarked?.(batch);
    } catch (error) {
      onError?.(error, batch);
    } finally {
      inFlight = false;
      if (queued.size > 0) {
        scheduleFlush();
      }
    }
  };

  return {
    schedule(messageIds) {
      const normalized = normalizeMessageIds(messageIds);
      if (normalized.length === 0) return;
      for (const id of normalized) {
        queued.add(id);
      }
      scheduleFlush();
    },
    async flush() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      await flushInternal();
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      queued.clear();
    },
  };
}
