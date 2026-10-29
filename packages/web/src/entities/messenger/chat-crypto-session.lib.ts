import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { openRealChatSession } from "./chat-crypto-runtime.lib";
import type { RealChatSession } from "./chat-crypto-runtime.lib";

interface SharedSession {
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
  const state = useWorkspaceMessageStore.getState();
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
      message.payload.kind !== "e2ee",
  );
  const signature = JSON.stringify(
    serviceMessages.map((message) => [message.uuid, message.authorUuid, message.payload]),
  );
  if (entry.lastIngest?.signature === signature) return entry.lastIngest.promise;
  const ingestion = {
    signature,
    promise: entry.promise
      .then((session) => {
        if (
          !entry.abort.signal.aborted &&
          activeSessions.get(key) === entry &&
          useWorkspaceMessageStore.getState().ownerKey === workspaceRuntimeOwnerKey(runtime)
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

/** Page and drawer share one domain session for the same live runtime. */
export function acquireChatCryptoSession(runtime: WorkspaceRuntimeContext, streamUuid: string) {
  const key = `${workspaceRuntimeOwnerKey(runtime)}:${runtime.runtimeGeneration}:${streamUuid}`;
  let shared = activeSessions.get(key);
  if (!shared) {
    const abort = new AbortController();
    const promise = openRealChatSession({
      runtimeContext: runtime,
      streamUuid,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      signal: abort.signal,
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
      void syncSessionMessages(key, entry, runtime, streamUuid).catch(() => undefined);
    };
    entry.unsubscribeMessages = useWorkspaceMessageStore.subscribe((state, previous) => {
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
      return released ? Promise.resolve() : syncSessionMessages(key, entry, runtime, streamUuid);
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
      entry.unsubscribeMessages?.();
      entry.abort.abort();
      if (activeSessions.get(key) === entry) activeSessions.delete(key);
      void entry.promise.then(
        (session) => session.dispose(),
        () => undefined,
      );
    },
  };
}
