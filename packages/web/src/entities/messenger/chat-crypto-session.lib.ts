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
}
const activeSessions = new Map<string, SharedSession>();

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
  }
  const entry = shared;
  entry.users++;
  let released = false;
  return {
    promise: entry.promise,
    async ingest(messages: readonly MessengerMessage[]): Promise<void> {
      if (released || activeSessions.get(key) !== entry) return;
      const signature = JSON.stringify(
        messages.map((message) => [message.uuid, message.authorUuid, message.payload]),
      );
      if (entry.lastIngest === signature) return;
      entry.lastIngest = signature;
      try {
        const session = await entry.promise;
        if (!entry.abort.signal.aborted && activeSessions.get(key) === entry)
          await session.ingest(messages);
      } catch (error) {
        if (entry.lastIngest === signature) entry.lastIngest = null;
        throw error;
      }
    },
    release() {
      if (released) return;
      released = true;
      if (--entry.users > 0) return;
      entry.abort.abort();
      if (activeSessions.get(key) === entry) activeSessions.delete(key);
      void entry.promise.then(
        (session) => session.dispose(),
        () => undefined,
      );
    },
  };
}
