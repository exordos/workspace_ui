import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { openRealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { RealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { ChatE2eeControllerState } from "~/entities/messenger/chat-e2ee-controller.types";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";

const emptyState: ChatE2eeControllerState = {
  access: "missing",
  pending: false,
  requestStatus: "idle",
  error: null,
};
interface SessionView {
  scopeKey: string;
  session: RealChatSession | null;
  state: ChatE2eeControllerState;
  loading: boolean;
  error: boolean;
  errorMessage?: string;
}

interface SharedSession {
  users: number;
  abort: AbortController;
  promise: Promise<RealChatSession>;
  lastIngest: string | null;
}
const activeSessions = new Map<string, SharedSession>();
function acquireSession(
  key: string,
  runtime: WorkspaceRuntimeContext,
  streamUuid: string,
): SharedSession {
  const existing = activeSessions.get(key);
  if (existing) {
    existing.users++;
    return existing;
  }
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
  const shared: SharedSession = { users: 1, abort, promise, lastIngest: null };
  activeSessions.set(key, shared);
  return shared;
}
function releaseSession(key: string, shared: SharedSession): void {
  shared.users--;
  if (shared.users > 0) return;
  shared.abort.abort();
  if (activeSessions.get(key) === shared) activeSessions.delete(key);
  void shared.promise.then(
    (session) => session.dispose(),
    () => undefined,
  );
}

/** Coordinates existing domain operations; presentation components receive only state and callbacks. */
export function useChatCryptoSession(streamUuid: string | null) {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtime = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const ownerKey = runtime === null ? null : workspaceRuntimeOwnerKey(runtime);
  const stream = useMessengerStore((state) =>
    state.ownerKey === ownerKey && streamUuid !== null ? state.streamsById[streamUuid] : undefined,
  );
  const enabled = stream?.encryption === true && runtime !== null;
  const scopeKey = enabled
    ? `${ownerKey}:${runtime.runtimeGeneration}:${streamUuid}:${stream.currentEncryptionKey?.keyUuid}:${stream.currentEncryptionKey?.keyFingerprint}`
    : "";
  const keyUuid = stream?.currentEncryptionKey?.keyUuid;
  const keyFingerprint = stream?.currentEncryptionKey?.keyFingerprint;
  const runtimeRef = useRef(runtime);
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);
  const [view, setView] = useState<SessionView | null>(null);
  const current = view?.scopeKey === scopeKey ? view : null;
  const messagesOwnerKey = useWorkspaceMessageStore((state) => state.ownerKey);
  const messagesById = useWorkspaceMessageStore((state) => state.messagesById);
  const messages = useMemo(
    () =>
      messagesOwnerKey === ownerKey
        ? Object.values(messagesById).filter(
            (message) =>
              message.streamUuid === streamUuid &&
              message.projectId === runtime?.projectId &&
              message.payload.kind !== "e2ee" &&
              message.payload.kind !== "markdown",
          )
        : [],
    [messagesById, messagesOwnerKey, ownerKey, runtime?.projectId, streamUuid],
  );

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!enabled || runtime === null || streamUuid === null) return;
    let disposed = false;
    const shared = acquireSession(scopeKey, runtime, streamUuid);
    let unsubscribe: (() => void) | undefined;
    const isCurrent = () => {
      const live = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      const catalog = useMessengerStore.getState();
      return (
        !disposed &&
        live !== null &&
        workspaceRuntimeOwnerKey(live) === ownerKey &&
        live.runtimeGeneration === runtime.runtimeGeneration &&
        catalog.ownerKey === ownerKey &&
        catalog.streamsById[streamUuid]?.currentEncryptionKey?.keyUuid === keyUuid &&
        catalog.streamsById[streamUuid]?.currentEncryptionKey?.keyFingerprint === keyFingerprint
      );
    };
    setView({ scopeKey, session: null, state: emptyState, loading: true, error: false });
    void shared.promise
      .then((opened) => {
        if (!isCurrent()) return;
        const publish = () => {
          if (isCurrent())
            setView({
              scopeKey,
              session: opened,
              state: opened.getState(),
              loading: false,
              error: false,
            });
        };
        unsubscribe = opened.subscribe(publish);
        publish();
      })
      .catch(() => {
        if (isCurrent())
          setView({ scopeKey, session: null, state: emptyState, loading: false, error: true });
      });
    return () => {
      disposed = true;
      unsubscribe?.();
      releaseSession(scopeKey, shared);
    };
  }, [enabled, ownerKey, keyUuid, keyFingerprint, scopeKey, streamUuid]);

  useEffect(() => {
    const active = current?.session;
    if (active === null || active === undefined) return;
    const shared = activeSessions.get(scopeKey);
    const signature = JSON.stringify(
      messages.map((message) => [message.uuid, message.authorUuid, message.payload]),
    );
    if (!shared || shared.lastIngest === signature) return;
    shared.lastIngest = signature;
    void active.ingest(messages).catch(() => {
      if (activeSessions.get(scopeKey) !== shared) return;
      if (shared.lastIngest === signature) shared.lastIngest = null;
      setView((previous) =>
        previous?.scopeKey === scopeKey && previous.session === active
          ? { ...previous, error: true }
          : previous,
      );
    });
  }, [current?.session, messages, scopeKey]);

  const requestKey = useCallback(
    async (keyUuid?: string) => {
      if (current?.session === null || current?.session === undefined) return;
      try {
        await current.session.requestKey(keyUuid);
      } catch (error) {
        setView((previous) =>
          previous?.scopeKey === scopeKey && previous.session === current.session
            ? {
                ...previous,
                error: true,
                errorMessage:
                  error instanceof Error && error.message === "historical-key-unavailable"
                    ? t("e2ee.historicalKeyUnavailable")
                    : undefined,
              }
            : previous,
        );
      }
    },
    [current?.session, scopeKey],
  );
  const grantKey = useCallback(
    async (requestUuid: string) => {
      if (current?.session === null || current?.session === undefined) return;
      try {
        await current.session.grantKey(requestUuid);
      } catch {
        setView((previous) =>
          previous?.scopeKey === scopeKey && previous.session === current.session
            ? { ...previous, error: true }
            : previous,
        );
      }
    },
    [current?.session, scopeKey],
  );
  const rejectKey = useCallback(
    async (requestUuid: string) => {
      if (current?.session === null || current?.session === undefined) return;
      try {
        await current.session.rejectKey(requestUuid);
      } catch {
        setView((previous) =>
          previous?.scopeKey === scopeKey && previous.session === current.session
            ? { ...previous, error: true }
            : previous,
        );
      }
    },
    [current?.session, scopeKey],
  );
  return {
    session: current?.session ?? null,
    state: current?.state ?? emptyState,
    loading: enabled && (current === null || current.loading),
    error:
      current?.error === true ||
      (current?.state.error !== null && current?.state.error !== undefined)
        ? (current?.errorMessage ?? t("e2ee.cryptoOperationFailed"))
        : null,
    requestKey,
    grantKey,
    rejectKey,
  };
}
