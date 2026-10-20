import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { RealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import { acquireChatCryptoSession } from "~/entities/messenger/chat-crypto-session.lib";
import type { ChatE2eeControllerState } from "~/entities/messenger/chat-e2ee-controller.types";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { toast } from "~/shared/lib/toast/toast";

const emptyMessages: Record<string, MessengerMessage> = {};

const emptyState: ChatE2eeControllerState = {
  access: "missing",
  pending: false,
  requestStatus: "idle",
  error: null,
};
interface SessionView {
  scopeKey: string;
  session: RealChatSession | null;
  lease?: ReturnType<typeof acquireChatCryptoSession>;
  state: ChatE2eeControllerState;
  sendKeyUuid?: string | null;
  loading: boolean;
  error: boolean;
  errorMessage?: string;
  requestErrors?: Readonly<Record<string, string>>;
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
  const scopeKey = enabled ? `${ownerKey}:${runtime.runtimeGeneration}:${streamUuid}` : "";
  const keyUuid = stream?.currentEncryptionKey?.keyUuid;
  const runtimeRef = useRef(runtime);
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);
  const [view, setView] = useState<SessionView | null>(null);
  const current = view?.scopeKey === scopeKey ? view : null;
  const activeSessionRef = useRef<RealChatSession | null>(null);
  useLayoutEffect(() => {
    activeSessionRef.current = current?.session ?? null;
    return () => {
      activeSessionRef.current = null;
    };
  }, [current?.session, scopeKey]);
  const isActionCurrent = useCallback(
    (active: RealChatSession) => {
      const latest = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      const catalog = useMessengerStore.getState();
      return (
        activeSessionRef.current === active &&
        latest !== null &&
        workspaceRuntimeOwnerKey(latest) === ownerKey &&
        latest.runtimeGeneration === runtime?.runtimeGeneration &&
        catalog.ownerKey === ownerKey &&
        streamUuid !== null &&
        catalog.streamsById[streamUuid]?.encryption === true
      );
    },
    [ownerKey, runtime?.runtimeGeneration, streamUuid],
  );
  const messagesById = useWorkspaceMessageStore((state) =>
    enabled && state.ownerKey === ownerKey ? state.messagesById : emptyMessages,
  );
  const messages = useMemo(
    () =>
      Object.values(messagesById).filter(
        (message) =>
          message.streamUuid === streamUuid &&
          message.projectId === runtime?.projectId &&
          message.payload.kind !== "e2ee" &&
          message.payload.kind !== "markdown",
      ),
    [messagesById, runtime?.projectId, streamUuid],
  );

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!enabled || runtime === null || streamUuid === null) return;
    let disposed = false;
    const shared = acquireChatCryptoSession(runtime, streamUuid);
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
        catalog.streamsById[streamUuid]?.encryption === true
      );
    };
    setView({ scopeKey, session: null, state: emptyState, loading: true, error: false });
    void shared.promise
      .then((opened) => {
        if (!isCurrent()) return;
        const publish = () => {
          if (isCurrent())
            setView((previous) => ({
              ...(previous?.scopeKey === scopeKey && previous.session === opened ? previous : {}),
              scopeKey,
              session: opened,
              lease: shared,
              state: opened.getState(),
              sendKeyUuid: opened.getState().sendKeyUuid,
              loading: false,
              error:
                previous?.scopeKey === scopeKey && previous.session === opened
                  ? previous.error
                  : false,
            }));
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
      shared.release();
    };
  }, [enabled, ownerKey, scopeKey, streamUuid]);

  useEffect(() => {
    const active = current?.session;
    if (active === null || active === undefined) return;
    let disposed = false;
    void current?.lease?.ingest(messages).then(
      () => {
        if (disposed) return;
        setView((previous) =>
          previous?.scopeKey === scopeKey &&
          previous.session === active &&
          previous.error &&
          previous.errorMessage === undefined
            ? { ...previous, error: false }
            : previous,
        );
      },
      () => {
        if (disposed) return;
        setView((previous) =>
          previous?.scopeKey === scopeKey && previous.session === active
            ? { ...previous, error: true }
            : previous,
        );
      },
    );
    return () => {
      disposed = true;
    };
  }, [current?.session, current?.lease, messages, scopeKey]);

  const clearActionError = useCallback(
    (active: RealChatSession) => {
      setView((previous) =>
        previous?.scopeKey === scopeKey && previous.session === active
          ? {
              ...previous,
              error: Object.keys(previous.requestErrors ?? {}).length > 0,
              errorMessage:
                Object.keys(previous.requestErrors ?? {}).length > 0
                  ? previous.errorMessage
                  : undefined,
            }
          : previous,
      );
    },
    [scopeKey],
  );
  const perform = useCallback(
    async (
      operation: (session: RealChatSession) => Promise<unknown>,
      failureMessage: string,
      showToast = false,
    ) => {
      const active = current?.session;
      if (active == null) return false;
      clearActionError(active);
      try {
        await operation(active);
        return isActionCurrent(active);
      } catch (error) {
        if (!isActionCurrent(active)) return false;
        const errorMessage =
          error instanceof Error && error.message === "historical-key-unavailable"
            ? t("e2ee.historicalKeyUnavailable")
            : failureMessage;
        setView((previous) =>
          previous?.scopeKey === scopeKey && previous.session === active
            ? {
                ...previous,
                error: true,
                errorMessage,
              }
            : previous,
        );
        if (showToast) toast.error(errorMessage);
        return false;
      }
    },
    [current?.session, scopeKey, clearActionError, isActionCurrent],
  );
  const requestKey = useCallback(
    (keyUuid?: string, recoveryMessage?: MessengerMessage) =>
      perform(
        async (active) => {
          const catalog = useWorkspaceMessageStore.getState();
          const probe =
            !recoveryMessage && keyUuid && catalog.ownerKey === ownerKey
              ? Object.values(catalog.messagesById).find(
                  (message) =>
                    message.streamUuid === streamUuid &&
                    message.projectId === runtime?.projectId &&
                    message.payload.kind === "e2ee" &&
                    message.payload.keyUuid === keyUuid,
                )
              : undefined;
          if (recoveryMessage) await active.requestKey(keyUuid, recoveryMessage);
          else if (probe) await active.requestKey(keyUuid, probe, true);
          else await active.requestKey(keyUuid);
        },
        t("e2ee.requestKeyFailed"),
        true,
      ),
    [perform, ownerKey, streamUuid, runtime?.projectId],
  );
  const requestOutcomes = useCallback(
    (active: RealChatSession, results: Awaited<ReturnType<RealChatSession["grantAllKeys"]>>) => {
      setView((previous) => {
        if (previous?.scopeKey !== scopeKey || previous.session !== active) return previous;
        const requestErrors = { ...previous.requestErrors };
        for (const result of results) {
          if (result.status === "failed")
            requestErrors[result.requestMessageUuid] = t("e2ee.cryptoOperationFailed");
          else delete requestErrors[result.requestMessageUuid];
        }
        const count = Object.keys(requestErrors).length;
        return {
          ...previous,
          requestErrors,
          error: count > 0,
          errorMessage: count > 0 ? t("e2ee.grantAllFailed", { count }) : undefined,
        };
      });
    },
    [scopeKey],
  );
  const respondToRequest = useCallback(
    async (requestUuid: string, action: "grantKey" | "rejectKey") => {
      const active = current?.session;
      if (active == null) return;
      let status: "granted" | "failed" = "granted";
      try {
        await active[action](requestUuid);
      } catch {
        status = "failed";
      }
      if (!isActionCurrent(active)) return;
      if (status === "failed")
        toast.error(t(action === "grantKey" ? "e2ee.grantKeyFailed" : "e2ee.rejectKeyFailed"));
      requestOutcomes(active, [{ requestMessageUuid: requestUuid, status }]);
    },
    [current?.session, requestOutcomes, isActionCurrent],
  );
  const grantKey = useCallback(
    (requestUuid: string) => respondToRequest(requestUuid, "grantKey"),
    [respondToRequest],
  );
  const rejectKey = useCallback(
    (requestUuid: string) => respondToRequest(requestUuid, "rejectKey"),
    [respondToRequest],
  );
  const removeLocalKey = useCallback(
    (keyUuid: string) =>
      perform((active) => active.removeLocalKey(keyUuid), t("e2ee.deleteLocalKeyFailed")),
    [perform],
  );
  const reissueKey = useCallback(
    () => perform((active) => active.reissueKey(), t("e2ee.rotateKeyFailed")),
    [perform],
  );
  const grantAllKeys = useCallback(
    () =>
      perform(
        async (active) => {
          const results = await active.grantAllKeys();
          if (!isActionCurrent(active)) return;
          requestOutcomes(active, results);
          const count = results.filter((result) => result.status === "failed").length;
          if (count > 0) toast.error(t("e2ee.grantAllFailed", { count }));
        },
        t("e2ee.grantAllKeysFailed"),
        true,
      ),
    [perform, requestOutcomes, isActionCurrent],
  );
  return {
    session: current?.session ?? null,
    state: current?.state ?? emptyState,
    sendKeyUuid: current?.sendKeyUuid ?? (current?.state.access === "ready" ? keyUuid : null),
    loading: enabled && (current === null || current.loading),
    error:
      current?.error === true ||
      (current?.state.error !== null && current?.state.error !== undefined)
        ? (current?.errorMessage ?? t("e2ee.cryptoOperationFailed"))
        : null,
    requestErrors: current?.requestErrors ?? {},
    reissueKey,
    removeLocalKey,
    grantAllKeys,
    requestKey,
    grantKey,
    rejectKey,
  };
}
