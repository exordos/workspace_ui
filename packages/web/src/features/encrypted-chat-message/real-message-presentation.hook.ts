import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { subscribeRealChatKeyChanges } from "~/entities/messenger/chat-crypto-resources.lib";
import type { RealChatKeyChange } from "~/entities/messenger/chat-crypto-resources.lib";
import {
  decryptRealChatMessageResult,
  type RealChatMessageDecryption,
} from "~/entities/messenger/chat-crypto-runtime.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";

type RealMessagePresentation = (RealChatMessageDecryption | { readonly status: "loading" }) & {
  readonly retry: () => void;
  readonly canRequestKey?: boolean;
};

/** Plaintext is scoped presentation memory, with no message-store/cache or mock fallback. */
export function useRealMessagePresentation(
  message: MessengerMessage | null,
): RealMessagePresentation {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtime = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const catalogOwner = useMessengerStore((state) => state.ownerKey);
  const messageOwner = useWorkspaceMessageStore((state) => state.ownerKey);
  const streamUuid = message?.streamUuid;
  const stream = useMessengerStore((state) =>
    streamUuid == null ? undefined : state.streamsById[streamUuid],
  );
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const [result, setResult] = useState<{
    scopeKey: string;
    revision: number;
    value: RealChatMessageDecryption;
  } | null>(null);
  const retry = useCallback(() => {
    revisionRef.current++;
    setRevision(revisionRef.current);
  }, []);
  const owner = runtime === null ? null : workspaceRuntimeOwnerKey(runtime);
  const allowed =
    message !== null &&
    runtime !== null &&
    owner === catalogOwner &&
    owner === messageOwner &&
    message.projectId === runtime.projectId &&
    stream?.encryption === true &&
    message.payload.kind === "e2ee";
  const scopeKey = allowed
    ? JSON.stringify([owner, runtime.runtimeGeneration, message.uuid, message.payload])
    : "";
  // A quote can switch to another source or a self-contained snapshot.
  if (result != null && result.scopeKey !== scopeKey) setResult(null);
  const keyUuid = message?.payload.kind === "e2ee" ? message.payload.keyUuid : null;
  useEffect(() => {
    if (streamUuid == null || keyUuid == null) return;
    return subscribeRealChatKeyChanges((change?: RealChatKeyChange) => {
      if (
        change &&
        (change.ownerKey !== owner ||
          change.streamUuid !== streamUuid ||
          change.keyUuid !== keyUuid)
      )
        return;
      // A removed secret must also remove its plaintext from mounted presentation memory.
      if (change?.kind === "removed") setResult(null);
      retry();
    });
  }, [owner, streamUuid, keyUuid, retry]);
  useEffect(() => {
    if (!allowed) return;
    let disposed = false;
    const isCurrent = () => {
      const current = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      const catalog = useMessengerStore.getState();
      return (
        !disposed &&
        revisionRef.current === revision &&
        current !== null &&
        workspaceRuntimeOwnerKey(current) === owner &&
        current.runtimeGeneration === runtime.runtimeGeneration &&
        useWorkspaceMessageStore.getState().ownerKey === owner &&
        catalog.ownerKey === owner &&
        catalog.streamsById[message.streamUuid]?.encryption === true
      );
    };
    void decryptRealChatMessageResult(runtime, message, isCurrent)
      .then((value) => {
        if (isCurrent()) setResult({ scopeKey, revision, value });
      })
      .catch(() => {
        if (isCurrent()) setResult({ scopeKey, revision, value: { status: "error" } });
      });
    return () => {
      disposed = true;
    };
  }, [allowed, runtime, owner, scopeKey, message, revision]);
  if (!allowed) return { status: "missing-key", retry, canRequestKey: false };
  if (result?.scopeKey !== scopeKey) return { status: "loading", retry };
  // Unrelated key notifications must not hide verified text during a background check.
  if (result.revision !== revision && result.value.status !== "ready")
    return { status: "loading", retry };
  return {
    ...result.value,
    retry,
    canRequestKey:
      result.value.status === "missing-key" ||
      (result.value.status === "error" && result.value.canRequestKey === true),
  };
}
