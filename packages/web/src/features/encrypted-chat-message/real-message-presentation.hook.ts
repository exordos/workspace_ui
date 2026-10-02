import { useEffect, useMemo, useState } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { subscribeRealChatKeyChanges } from "~/entities/messenger/chat-crypto-resources.lib";
import { decryptRealChatMessage } from "~/entities/messenger/chat-crypto-runtime.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";

/** Plaintext is scoped presentation memory, with no message-store/cache or mock fallback. */
export function useRealMessagePresentation(message: MessengerMessage): string | null {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtime = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const catalogOwner = useMessengerStore((state) => state.ownerKey);
  const messageOwner = useWorkspaceMessageStore((state) => state.ownerKey);
  const stream = useMessengerStore((state) => state.streamsById[message.streamUuid]);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ scopeKey: string; plaintext: string | null } | null>(null);
  const owner = runtime === null ? null : workspaceRuntimeOwnerKey(runtime);
  const allowed =
    runtime !== null &&
    owner === catalogOwner &&
    owner === messageOwner &&
    message.projectId === runtime.projectId &&
    stream?.encryption === true &&
    message.payload.kind === "e2ee";
  const scopeKey = allowed
    ? `${owner}:${runtime.runtimeGeneration}:${message.uuid}:${message.payload.kind === "e2ee" ? message.payload.keyUuid : ""}:${message.payload.kind === "e2ee" ? message.payload.content : ""}`
    : "";
  useEffect(() => subscribeRealChatKeyChanges(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    if (!allowed || runtime === null) return;
    let disposed = false;
    const isCurrent = () => {
      const current = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      const catalog = useMessengerStore.getState();
      return (
        !disposed &&
        current !== null &&
        workspaceRuntimeOwnerKey(current) === owner &&
        current.runtimeGeneration === runtime.runtimeGeneration &&
        useWorkspaceMessageStore.getState().ownerKey === owner &&
        catalog.ownerKey === owner &&
        catalog.streamsById[message.streamUuid]?.encryption === true
      );
    };
    void decryptRealChatMessage(runtime, message, isCurrent)
      .then((plaintext) => {
        if (isCurrent()) setResult({ scopeKey, plaintext });
      })
      .catch(() => {
        if (isCurrent()) setResult({ scopeKey, plaintext: null });
      });
    return () => {
      disposed = true;
    };
  }, [allowed, runtime, owner, scopeKey, message, revision]);
  return allowed && result?.scopeKey === scopeKey ? result.plaintext : null;
}
