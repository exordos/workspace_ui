// Centralized chat-list snapshot → IndexedDB sync (single persist entry point).
import { persistChatListSnapshotToIndexedDb } from "~/entities/chat-list/chat-list-snapshot-persist.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";

const CHAT_LIST_SNAPSHOT_SYNC_DEBOUNCE_MS = 750;

interface StartChatListSnapshotSyncOptions {
  instanceId: string;
  debounceMs?: number;
  persistSnapshot?: (instanceId: string) => Promise<void>;
}

interface ChatListRefs {
  streamsMap: ReturnType<typeof useChatListStore.getState>["streamsMap"];
  dmsMap: ReturnType<typeof useChatListStore.getState>["dmsMap"];
  messageIdToLocation: ReturnType<typeof useChatListStore.getState>["messageIdToLocation"];
  currentUserId: ReturnType<typeof useChatListStore.getState>["currentUserId"];
}

function hasTrackedChatListRefsChanged(prev: ChatListRefs, next: ChatListRefs): boolean {
  return (
    prev.streamsMap !== next.streamsMap ||
    prev.dmsMap !== next.dmsMap ||
    prev.messageIdToLocation !== next.messageIdToLocation ||
    prev.currentUserId !== next.currentUserId
  );
}

export function startChatListSnapshotSync(options: StartChatListSnapshotSyncOptions): () => void {
  const {
    instanceId,
    debounceMs = CHAT_LIST_SNAPSHOT_SYNC_DEBOUNCE_MS,
    persistSnapshot = persistChatListSnapshotToIndexedDb,
  } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let queued = false;

  let trackedRefs: ChatListRefs = (() => {
    const state = useChatListStore.getState();
    return {
      streamsMap: state.streamsMap,
      dmsMap: state.dmsMap,
      messageIdToLocation: state.messageIdToLocation,
      currentUserId: state.currentUserId,
    };
  })();

  const flushNow = () => {
    if (inFlight || !queued) return;
    const snapshotState = useChatListStore.getState();
    // After clear() and before hydrate the store is empty — do not overwrite another org's IDB cache.
    if (!snapshotState.sidebarDataHydrated) {
      queued = false;
      logChatListFlow("idb: chatListSnapshot persist flush (skipped, sidebar not hydrated)", {
        instanceId,
      });
      return;
    }
    queued = false;
    inFlight = true;
    logChatListFlow("idb: chatListSnapshot persist flush (start)", { instanceId });
    void persistSnapshot(instanceId)
      .catch(() => {
        logChatListFlow("idb: chatListSnapshot persist flush (persist rejected)", { instanceId });
      })
      .finally(() => {
        inFlight = false;
        logChatListFlow("idb: chatListSnapshot persist flush (done)", { instanceId });
        if (queued) {
          scheduleFlush();
        }
      });
  };

  const scheduleFlush = () => {
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      flushNow();
    }, debounceMs);
  };

  const queueFlush = () => {
    const wasQueued = queued;
    queued = true;
    logChatListFlow(
      wasQueued
        ? "idb: chatListSnapshot persist re-queued (while pending or writing)"
        : "idb: chatListSnapshot persist queued (store maps changed)",
      { instanceId, inFlight },
    );
    if (inFlight) return;
    scheduleFlush();
  };

  const unsubscribe = useChatListStore.subscribe((nextState) => {
    const nextRefs: ChatListRefs = {
      streamsMap: nextState.streamsMap,
      dmsMap: nextState.dmsMap,
      messageIdToLocation: nextState.messageIdToLocation,
      currentUserId: nextState.currentUserId,
    };
    if (!hasTrackedChatListRefsChanged(trackedRefs, nextRefs)) {
      return;
    }
    trackedRefs = nextRefs;
    queueFlush();
  });

  return () => {
    unsubscribe();
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    flushNow();
  };
}
