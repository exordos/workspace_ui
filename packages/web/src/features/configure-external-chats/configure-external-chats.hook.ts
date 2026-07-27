import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { adaptWorkspaceExternalChatDto } from "~/entities/external-chat/external-chat-adapters.lib";
import {
  externalChatScopeKey,
  loadExternalChats,
} from "~/entities/external-chat/external-chat-loader.lib";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import type { ExternalChat } from "~/entities/external-chat/external-chat.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { selectExternalChat } from "~/shared/api/messenger-external-chats.api";
import { runWithConcurrency } from "./configure-external-chats.lib";

const EMPTY_EXTERNAL_CHATS: ExternalChat[] = [];
const EMPTY_CHAT_UUIDS = new Set<string>();

interface ExternalChatSubmissionState {
  scopeKey: string;
  pending: Set<string>;
  failed: Set<string>;
  submitting: boolean;
}

function emptySubmissionState(scopeKey: string): ExternalChatSubmissionState {
  return {
    scopeKey,
    pending: new Set(),
    failed: new Set(),
    submitting: false,
  };
}

function currentRuntimeContext(): WorkspaceRuntimeContext | null {
  return selectCurrentWorkspaceRuntimeContext(useWorkspaceAuthStore.getState());
}

export function useConfigureExternalChats(options: {
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext;
  account: ExternalAccount;
}) {
  const { open, runtimeContext, account } = options;
  const scopeKey = externalChatScopeKey(runtimeContext, account.uuid);
  const chats = useExternalChatsStore((state) =>
    state.scopeKey === scopeKey ? state.chats : EMPTY_EXTERNAL_CHATS,
  );
  const loadStatus = useExternalChatsStore((state) =>
    state.scopeKey === scopeKey ? state.loadStatus : "idle",
  );
  const loadError = useExternalChatsStore((state) =>
    state.scopeKey === scopeKey ? state.error : null,
  );
  const authoritativeResetGeneration = useExternalChatsStore(
    (state) => state.authoritativeResetGeneration,
  );
  const [query, setQuery] = useState("");
  const [submissionState, setSubmissionState] = useState<ExternalChatSubmissionState>(() =>
    emptySubmissionState(scopeKey),
  );
  const pending =
    submissionState.scopeKey === scopeKey ? submissionState.pending : EMPTY_CHAT_UUIDS;
  const failed = submissionState.scopeKey === scopeKey ? submissionState.failed : EMPTY_CHAT_UUIDS;
  const submitting = submissionState.scopeKey === scopeKey ? submissionState.submitting : false;
  const mountedRef = useRef(false);
  const currentScopeKeyRef = useRef(scopeKey);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentScopeKeyRef.current = scopeKey;
  }, [scopeKey]);

  const refresh = useCallback(
    (signal?: AbortSignal) =>
      loadExternalChats({
        runtimeContext,
        accountUuid: account.uuid,
        getRuntimeContext: currentRuntimeContext,
        signal,
      }),
    [account.uuid, runtimeContext],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [authoritativeResetGeneration, open, refresh]);

  const toggle = useCallback(
    (chatUuid: string) => {
      setSubmissionState((currentState) => {
        const current =
          currentState.scopeKey === scopeKey ? currentState : emptySubmissionState(scopeKey);
        const nextPending = new Set(current.pending);
        const nextFailed = new Set(current.failed);
        if (nextPending.has(chatUuid)) nextPending.delete(chatUuid);
        else nextPending.add(chatUuid);
        nextFailed.delete(chatUuid);
        return {
          ...current,
          pending: nextPending,
          failed: nextFailed,
        };
      });
    },
    [scopeKey],
  );

  const submitUuids = useCallback(
    async (uuids: readonly string[]) => {
      if (submitting || uuids.length === 0) return;
      setSubmissionState((currentState) => {
        const current =
          currentState.scopeKey === scopeKey ? currentState : emptySubmissionState(scopeKey);
        return { ...current, submitting: true };
      });
      const nextFailed = new Set<string>();
      const requestOptions = buildMessengerRequestOptions(runtimeContext);
      await runWithConcurrency(uuids, 3, async (chatUuid) => {
        try {
          const snapshot = await selectExternalChat(
            requestOptions,
            chatUuid,
            runtimeContext.projectId,
          );
          useExternalChatsStore
            .getState()
            .upsert(scopeKey, account.uuid, adaptWorkspaceExternalChatDto(snapshot));
        } catch {
          nextFailed.add(chatUuid);
        }
      });
      const isCurrentScope = (): boolean =>
        mountedRef.current && currentScopeKeyRef.current === scopeKey;
      if (!isCurrentScope()) return;
      if (nextFailed.size > 0) {
        await refresh();
      }
      if (!isCurrentScope()) return;
      const current = useExternalChatsStore.getState();
      if (current.scopeKey === scopeKey) {
        const selectedUuids = new Set(
          current.chats.filter((chat) => chat.selected).map((chat) => chat.uuid),
        );
        for (const uuid of nextFailed) {
          if (selectedUuids.has(uuid)) nextFailed.delete(uuid);
        }
      }
      setSubmissionState((currentState) =>
        currentState.scopeKey === scopeKey
          ? {
              ...currentState,
              failed: nextFailed,
              pending: nextFailed,
              submitting: false,
            }
          : currentState,
      );
    },
    [account.uuid, refresh, runtimeContext, scopeKey, submitting],
  );

  const start = useCallback(() => void submitUuids([...pending]), [pending, submitUuids]);
  const retryFailed = useCallback(() => void submitUuids([...failed]), [failed, submitUuids]);

  const visibleChats = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return chats;
    return chats.filter((chat) => chat.displayName.toLocaleLowerCase().includes(normalized));
  }, [chats, query]);
  const selectedChats = chats.filter((chat) => chat.selected);
  const readyCount = selectedChats.filter((chat) => chat.status === "live").length;

  return {
    chats: visibleChats,
    loadStatus,
    loadError,
    query,
    pending,
    failed,
    submitting,
    readyCount,
    selectedCount: selectedChats.length,
    setQuery,
    toggle,
    start,
    retryFailed,
    refresh: () => void refresh(),
  };
}
