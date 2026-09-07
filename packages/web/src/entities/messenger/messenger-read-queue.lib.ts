import { compareWorkspaceMessages } from "~/entities/message/message-workspace-order.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { markMessengerMessagesReadUpTo } from "./messenger-message-actions.lib";
import type { MessengerMessage, MessengerUuid } from "./messenger.types";

const READ_BATCH_DELAY_MS = 250;
const MAX_READ_RETRY_COUNT = 2;
interface Boundary {
  message: MessengerMessage;
  retryCount: number;
}
interface TopicQueue {
  pending: Boundary | null;
  inFlight: Boundary | null;
  lastApplied: MessengerMessage | null;
  failed: Boundary | null;
  retryNotBefore: number;
}
function later(current: Boundary | null, candidate: Boundary): Boundary {
  return current == null || compareWorkspaceMessages(candidate.message, current.message) > 0
    ? candidate
    : current;
}
function runtimeKey(context: WorkspaceRuntimeContext): string {
  return `${workspaceRuntimeOwnerKey(context)}\u0000${context.runtimeGeneration}`;
}

export function createMessengerReadQueue(initialContext: WorkspaceRuntimeContext) {
  const queues = new Map<string, TopicQueue>();
  const controllers = new Set<AbortController>();
  const listeners = new Set<() => void>();
  let context = initialContext;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dueAt = 0;
  let snapshot: ReadonlySet<MessengerUuid> = new Set();
  function publish() {
    snapshot = new Set(
      [...queues.values()].flatMap((queue) => {
        const boundary = queue.inFlight ?? (queue.retryNotBefore > 0 ? queue.pending : null);
        return boundary == null ? [] : [boundary.message.uuid];
      }),
    );
    for (const listener of listeners) listener();
  }
  function arm(delay = READ_BATCH_DELAY_MS) {
    if (disposed || (timer != null && dueAt <= Date.now() + delay)) return;
    if (timer != null) clearTimeout(timer);
    dueAt = Date.now() + delay;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, delay);
  }
  function flush() {
    if (disposed) return;
    for (const queue of queues.values()) {
      const pending = queue.pending;
      if (pending == null || queue.inFlight != null) continue;
      if (queue.retryNotBefore > Date.now()) {
        arm(queue.retryNotBefore - Date.now());
        continue;
      }
      queue.pending = null;
      queue.inFlight = pending;
      queue.retryNotBefore = 0;
      publish();
      const controller = new AbortController();
      controllers.add(controller);
      // The captured intent remains valid when its message window has been evicted.
      void markMessengerMessagesReadUpTo({
        runtimeContext: context,
        getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        signal: controller.signal,
        messageUuid: pending.message.uuid,
      })
        .then((result) => {
          if (disposed) return;
          if (result.status === "applied") {
            if (
              queue.lastApplied == null ||
              compareWorkspaceMessages(pending.message, queue.lastApplied) > 0
            ) {
              queue.lastApplied = pending.message;
            }
            queue.failed = null;
          } else {
            queue.failed = pending;
          }
        })
        .catch(() => {
          if (disposed) return;
          const newer =
            queue.pending != null &&
            compareWorkspaceMessages(queue.pending.message, pending.message) > 0;
          if (newer || pending.retryCount < MAX_READ_RETRY_COUNT) {
            queue.pending = later(queue.pending, {
              message: pending.message,
              retryCount: pending.retryCount + 1,
            });
            queue.retryNotBefore = Date.now() + 500 * 2 ** pending.retryCount;
          } else {
            queue.failed = pending;
          }
        })
        .finally(() => {
          controllers.delete(controller);
          if (disposed) return;
          queue.inFlight = null;
          publish();
          if (queue.pending != null) arm(Math.max(0, queue.retryNotBefore - Date.now()));
        });
    }
  }
  return {
    updateContext(next: WorkspaceRuntimeContext) {
      context = next;
    },
    enqueue(message: MessengerMessage) {
      if (disposed) return;
      const key = `${message.streamUuid}\u0000${message.topicUuid}`;
      const queue = queues.get(key) ?? {
        pending: null,
        inFlight: null,
        lastApplied: null,
        failed: null,
        retryNotBefore: 0,
      };
      queues.set(key, queue);
      if (
        queue.inFlight != null &&
        (queue.inFlight.message.uuid === message.uuid ||
          compareWorkspaceMessages(message, queue.inFlight.message) <= 0)
      )
        return;
      if (
        !message.isOwn &&
        queue.lastApplied != null &&
        compareWorkspaceMessages(message, queue.lastApplied) <= 0
      )
        return;
      if (message.read && queue.failed == null) return;
      queue.pending = later(queue.pending, { message, retryCount: 0 });
      if (queue.failed != null) {
        queue.pending = later(queue.pending, { ...queue.failed, retryCount: 0 });
        queue.failed = null;
      }
      arm();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    dispose() {
      disposed = true;
      if (timer != null) clearTimeout(timer);
      for (const controller of controllers) controller.abort();
      controllers.clear();
      queues.clear();
      publish();
      listeners.clear();
    },
  };
}

let active: { key: string; queue: ReturnType<typeof createMessengerReadQueue> } | null = null;

export function resetMessengerReadQueue(): void {
  active?.queue.dispose();
  active = null;
}

// Auth changes invalidate delivery immediately, even when no chat is mounted.
const unsubscribeAuth = useWorkspaceAuthStore.subscribe((state) => {
  const context = state.getCurrentRuntimeContext();
  if (context == null || (active != null && active.key !== runtimeKey(context))) {
    resetMessengerReadQueue();
  } else {
    active?.queue.updateContext(context);
  }
});

export function getMessengerReadQueue(context: WorkspaceRuntimeContext) {
  const key = runtimeKey(context);
  const current = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (current == null || runtimeKey(current) !== key) return null;
  if (active?.key !== key) {
    resetMessengerReadQueue();
    active = { key, queue: createMessengerReadQueue(context) };
  }
  active.queue.updateContext(context);
  return active.queue;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeAuth();
    resetMessengerReadQueue();
  });
}
