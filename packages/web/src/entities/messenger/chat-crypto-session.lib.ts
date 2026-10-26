import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { openRealChatSession } from "./chat-crypto-runtime.lib";
import type { RealChatSession } from "./chat-crypto-runtime.lib";
import type { MessengerMessage } from "./messenger.types";

interface SharedSession {
  users: number;
  abort: AbortController;
  promise: Promise<RealChatSession>;
  lastIngest: string | null;
  unsubscribeMessages?: () => void;
}
const activeSessions = new Map<string, SharedSession>();

async function ingestSessionMessages(
  key: string,
  entry: SharedSession,
  runtime: WorkspaceRuntimeContext,
  streamUuid: string,
  messages: readonly MessengerMessage[],
): Promise<void> {
  if (entry.abort.signal.aborted || activeSessions.get(key) !== entry) return;
  const serviceMessages = messages.filter(
    (message) =>
      message.streamUuid === streamUuid &&
      message.projectId === runtime.projectId &&
      message.payload.kind !== "markdown" &&
      message.payload.kind !== "e2ee",
  );
  const signature = JSON.stringify(
    serviceMessages.map((message) => [message.uuid, message.authorUuid, message.payload]),
  );
  if (entry.lastIngest === signature) return;
  entry.lastIngest = signature;
  try {
    const session = await entry.promise;
    if (!entry.abort.signal.aborted && activeSessions.get(key) === entry)
      await session.ingest(serviceMessages);
  } catch (error) {
    if (entry.lastIngest === signature) entry.lastIngest = null;
    throw error;
  }
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
    shared = { users: 0, abort, promise, lastIngest: null };
    activeSessions.set(key, shared);
    const entry = shared;
    const ingestStored = () => {
      const state = useWorkspaceMessageStore.getState();
      if (state.ownerKey !== workspaceRuntimeOwnerKey(runtime)) return;
      const messages = Object.values(state.messagesById);
      if (
        !messages.some(
          (message) =>
            message.streamUuid === streamUuid &&
            message.projectId === runtime.projectId &&
            message.payload.kind !== "markdown" &&
            message.payload.kind !== "e2ee",
        )
      )
        return;
      void ingestSessionMessages(key, entry, runtime, streamUuid, messages).catch(() => undefined);
    };
    entry.unsubscribeMessages = useWorkspaceMessageStore.subscribe(ingestStored);
    ingestStored();
  }
  const entry = shared;
  entry.users++;
  let released = false;
  return {
    promise: entry.promise,
    async ingest(messages: readonly MessengerMessage[]): Promise<void> {
      if (released) return;
      return ingestSessionMessages(key, entry, runtime, streamUuid, messages);
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
