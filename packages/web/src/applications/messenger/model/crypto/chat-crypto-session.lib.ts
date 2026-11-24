import {
  resolveWorkspaceOwnerRuntimeForRequest,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getMessengerStoreForOwner, getSelectedMessengerStore } from "../chats/messenger.model";
import {
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
} from "../messages/message.model";
import { openRealChatSession } from "./chat-crypto-runtime.lib";
import { clearPreparedPlaintextForOwner } from "./chat-plaintext-window-cache.lib";
import type { RealChatSession } from "./chat-crypto-runtime.lib";

interface SharedSession {
  ownerKey: string;
  isCurrent: () => boolean;
  messageStore: ReturnType<typeof getSelectedWorkspaceMessageStore>;
  users: number;
  abort: AbortController;
  promise: Promise<RealChatSession>;
  lastIngest: { signature: string; promise: Promise<void> } | null;
  ingestionFailed: boolean;
  listeners: Set<() => void>;
  unsubscribeMessages?: () => void;
}
const activeSessions = new Map<string, SharedSession>();

function syncSessionMessages(
  key: string,
  entry: SharedSession,
  runtime: WorkspaceRuntimeContext,
  streamUuid: string,
): Promise<void> {
  const state = entry.messageStore.getState();
  if (
    entry.abort.signal.aborted ||
    activeSessions.get(key) !== entry ||
    state.ownerKey !== workspaceRuntimeOwnerKey(runtime)
  )
    return Promise.resolve();
  const serviceMessages = Object.values(state.messagesById).filter(
    (message) =>
      message.streamUuid === streamUuid &&
      message.projectId === runtime.projectId &&
      message.payload.kind !== "markdown" &&
      message.payload.kind !== "poll" &&
      message.payload.kind !== "e2ee",
  );
  const signature = JSON.stringify(
    serviceMessages.map((message) => [
      message.uuid,
      message.topicUuid,
      message.authorUuid,
      message.payload,
    ]),
  );
  if (entry.lastIngest?.signature === signature) return entry.lastIngest.promise;
  const ingestion = {
    signature,
    promise: entry.promise
      .then((session) => {
        if (
          !entry.abort.signal.aborted &&
          activeSessions.get(key) === entry &&
          entry.messageStore.getState().ownerKey === workspaceRuntimeOwnerKey(runtime)
        )
          return session.ingest(serviceMessages);
      })
      .then(
        () => publish(false),
        (error: unknown) => {
          publish(true);
          throw error;
        },
      ),
  };
  const publish = (failed: boolean) => {
    if (entry.abort.signal.aborted || entry.lastIngest !== ingestion) return;
    if (failed) entry.lastIngest = null;
    entry.ingestionFailed = failed;
    for (const listener of entry.listeners) listener();
  };
  entry.lastIngest = ingestion;
  return ingestion.promise;
}

function disposeSharedSession(key: string, entry: SharedSession): void {
  if (activeSessions.get(key) !== entry) return;
  activeSessions.delete(key);
  entry.unsubscribeMessages?.();
  entry.listeners.clear();
  entry.abort.abort();
  void entry.promise.then(
    (session) => session.dispose(),
    () => undefined,
  );
}

// Release cryptographic leases and plaintext for an ending owner.
export function disposeChatCryptoOwner(ownerKey: string): void {
  for (const [key, entry] of activeSessions) {
    if (entry.ownerKey === ownerKey) disposeSharedSession(key, entry);
  }
  clearPreparedPlaintextForOwner(ownerKey);
}

useWorkspaceAuthStore.subscribe(() => {
  for (const [key, entry] of activeSessions) {
    if (!entry.isCurrent()) disposeSharedSession(key, entry);
  }
});

/** Page, drawer and delivery share the current credential lease of one owner and chat. */
export function acquireChatCryptoSession(runtime: WorkspaceRuntimeContext, streamUuid: string) {
  const ownerKey = workspaceRuntimeOwnerKey(runtime);
  const authorizedRuntime = resolveWorkspaceOwnerRuntimeForRequest(runtime);
  const context = authorizedRuntime ?? runtime;
  const getRuntimeContext =
    authorizedRuntime == null
      ? () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext()
      : () => useWorkspaceAuthStore.getState().getRuntimeContextForOwner(authorizedRuntime);
  // An expired screen request with the same numeric generation cannot join a valid owner lease.
  const key = JSON.stringify([
    ownerKey,
    context.runtimeGeneration,
    streamUuid,
    isWorkspaceRuntimeRequestContextCurrent(context, getRuntimeContext),
  ]);
  let shared = activeSessions.get(key);
  if (!shared) {
    const abort = new AbortController();
    const messageStore =
      getWorkspaceMessageStoreForOwner(ownerKey) ?? getSelectedWorkspaceMessageStore();
    const promise = openRealChatSession({
      runtimeContext: context,
      streamUuid,
      getRuntimeContext,
      signal: abort.signal,
      messengerStore: getMessengerStoreForOwner(ownerKey) ?? getSelectedMessengerStore(),
      messageStore,
    }).then(async (session) => {
      try {
        await session.load();
        return session;
      } catch (error) {
        session.dispose();
        throw error;
      }
    });
    shared = {
      ownerKey,
      isCurrent: () => isWorkspaceRuntimeRequestContextCurrent(context, getRuntimeContext),
      messageStore,
      users: 0,
      abort,
      promise,
      lastIngest: null,
      ingestionFailed: false,
      listeners: new Set(),
    };
    activeSessions.set(key, shared);
    const entry = shared;
    const ingestStored = () => {
      void syncSessionMessages(key, entry, context, streamUuid).catch(() => undefined);
    };
    entry.unsubscribeMessages = messageStore.subscribe((state, previous) => {
      if (state.messagesById !== previous.messagesById || state.ownerKey !== previous.ownerKey)
        ingestStored();
    });
    ingestStored();
  }
  const entry = shared;
  entry.users++;
  let released = false;
  return {
    promise: entry.promise,
    sync(): Promise<void> {
      return released ? Promise.resolve() : syncSessionMessages(key, entry, context, streamUuid);
    },
    get ingestionFailed() {
      return entry.ingestionFailed;
    },
    subscribeIngestion(listener: () => void) {
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    release() {
      if (released) return;
      released = true;
      if (--entry.users > 0) return;
      disposeSharedSession(key, entry);
    },
  };
}
