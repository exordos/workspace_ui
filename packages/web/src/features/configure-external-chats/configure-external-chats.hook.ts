import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adaptWorkspaceExternalAccountDto } from "~/entities/external-account/external-account-adapters.lib";
import { useExternalAccountsStore } from "~/entities/external-account/external-account.model";
import type {
  ExternalAccount,
  ExternalAccountHistoryDepth,
} from "~/entities/external-account/external-account.types";
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
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getExternalAccount,
  updateExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import { selectExternalChat } from "~/shared/api/messenger-external-chats.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { runWithConcurrency } from "./configure-external-chats.lib";

const EMPTY_EXTERNAL_CHATS: ExternalChat[] = [];
const EMPTY_CHAT_UUIDS = new Set<string>();

interface ExternalChatSubmissionState {
  scopeKey: string;
  pending: Set<string>;
  failed: Set<string>;
  submitting: boolean;
}

export type ExternalChatSettingsSaveStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "error"
  | "conflict"
  | "success";

interface HistoryDepthDraftState {
  accountUuid: string;
  saved: ExternalAccountHistoryDepth;
  draft: ExternalAccountHistoryDepth;
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
  const [historyDepthState, setHistoryDepthState] = useState<HistoryDepthDraftState>(() => ({
    accountUuid: account.uuid,
    saved: account.settings.historyDepth,
    draft: account.settings.historyDepth,
  }));
  const [saveStatus, setSaveStatus] = useState<ExternalChatSettingsSaveStatus>("clean");
  const [refreshingAccount, setRefreshingAccount] = useState(false);
  const [submissionState, setSubmissionState] = useState<ExternalChatSubmissionState>(() =>
    emptySubmissionState(scopeKey),
  );
  const mountedRef = useRef(false);
  const currentScopeKeyRef = useRef(scopeKey);
  const settingsRequestRef = useRef<AbortController | null>(null);
  const submissionRequestRef = useRef<AbortController | null>(null);
  const settingsSavingRef = useRef(false);
  const pending =
    submissionState.scopeKey === scopeKey ? submissionState.pending : EMPTY_CHAT_UUIDS;
  const failed = submissionState.scopeKey === scopeKey ? submissionState.failed : EMPTY_CHAT_UUIDS;
  const submitting = submissionState.scopeKey === scopeKey ? submissionState.submitting : false;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      settingsRequestRef.current?.abort();
      submissionRequestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    currentScopeKeyRef.current = scopeKey;
    submissionRequestRef.current?.abort();
    submissionRequestRef.current = null;
  }, [scopeKey]);

  useEffect(() => {
    if (open) return;
    submissionRequestRef.current?.abort();
    submissionRequestRef.current = null;
    setSubmissionState(emptySubmissionState(scopeKey));
  }, [open, scopeKey]);

  useEffect(() => {
    setHistoryDepthState((current) => {
      const incoming = account.settings.historyDepth;
      if (current.accountUuid !== account.uuid) {
        return { accountUuid: account.uuid, saved: incoming, draft: incoming };
      }
      const dirty = current.draft !== current.saved;
      return {
        ...current,
        saved: incoming,
        draft: dirty ? current.draft : incoming,
      };
    });
  }, [account.settings.historyDepth, account.uuid]);

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
      if (account.settings.selectionMode !== "explicit") return;
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
    [account.settings.selectionMode, scopeKey],
  );

  const historyDepth = historyDepthState.draft;
  const historyDepthDirty = historyDepthState.draft !== historyDepthState.saved;
  const settingsBusy = saveStatus === "saving" || refreshingAccount;
  const manualSelectionEnabled = account.settings.selectionMode === "explicit";
  const selectionBlockedBySettings = historyDepthDirty || settingsBusy || !manualSelectionEnabled;

  const changeHistoryDepth = useCallback((value: ExternalAccountHistoryDepth) => {
    setHistoryDepthState((current) => ({ ...current, draft: value }));
    setSaveStatus("dirty");
  }, []);

  const submitUuids = useCallback(
    async (uuids: readonly string[]) => {
      if (
        !manualSelectionEnabled ||
        submitting ||
        settingsSavingRef.current ||
        selectionBlockedBySettings ||
        uuids.length === 0
      ) {
        return;
      }
      const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
      if (requestContext == null) return;
      setSubmissionState((currentState) => {
        const current =
          currentState.scopeKey === scopeKey ? currentState : emptySubmissionState(scopeKey);
        return { ...current, submitting: true };
      });
      const nextFailed = new Set<string>();
      const controller = new AbortController();
      submissionRequestRef.current?.abort();
      submissionRequestRef.current = controller;
      const requestOptions = buildMessengerRequestOptions(
        runtimeContext,
        undefined,
        controller.signal,
      );
      await runWithConcurrency(uuids, 3, async (chatUuid) => {
        try {
          const snapshot = await selectExternalChat(
            requestOptions,
            chatUuid,
            runtimeContext.projectId,
          );
          if (
            isWorkspaceRuntimeRequestInvalidated(
              requestContext,
              currentRuntimeContext,
              controller.signal,
            )
          ) {
            return;
          }
          useExternalChatsStore
            .getState()
            .upsert(scopeKey, account.uuid, adaptWorkspaceExternalChatDto(snapshot));
        } catch {
          nextFailed.add(chatUuid);
        }
      });
      const isCurrentScope = (): boolean =>
        mountedRef.current &&
        currentScopeKeyRef.current === scopeKey &&
        !isWorkspaceRuntimeRequestInvalidated(
          requestContext,
          currentRuntimeContext,
          controller.signal,
        );
      if (!isCurrentScope()) return;
      if (nextFailed.size > 0) {
        await refresh(controller.signal);
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
      if (submissionRequestRef.current === controller) {
        submissionRequestRef.current = null;
      }
    },
    [
      account.uuid,
      manualSelectionEnabled,
      refresh,
      runtimeContext,
      scopeKey,
      selectionBlockedBySettings,
      submitting,
    ],
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
  let normalizedSaveStatus = saveStatus;
  if (saveStatus === "clean" && historyDepthDirty) normalizedSaveStatus = "dirty";
  if (saveStatus === "dirty" && !historyDepthDirty) normalizedSaveStatus = "clean";

  const saveHistoryDepth = useCallback(() => {
    if (!historyDepthDirty || settingsBusy || settingsRequestRef.current != null || submitting) {
      return;
    }

    const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
    if (requestContext == null) return;
    const ownerKey = workspaceRuntimeOwnerKey(requestContext);
    const controller = new AbortController();
    settingsRequestRef.current = controller;
    settingsSavingRef.current = true;
    setSaveStatus("saving");

    void updateExternalAccount(
      buildMessengerRequestOptions(runtimeContext, undefined, controller.signal),
      account.uuid,
      {
        settings: {
          kind: "zulip",
          selection_mode: account.settings.selectionMode,
          history_depth: historyDepth,
          default_project_id: runtimeContext.projectId,
        },
      },
      account.etag,
    )
      .then(async (snapshot) => {
        if (
          !mountedRef.current ||
          isWorkspaceRuntimeRequestInvalidated(
            requestContext,
            currentRuntimeContext,
            controller.signal,
          )
        ) {
          return;
        }
        const updatedAccount = adaptWorkspaceExternalAccountDto(snapshot.account, snapshot.etag);
        const accountStore = useExternalAccountsStore.getState();
        if (!accountStore.upsertAccountForOwner(ownerKey, updatedAccount)) {
          const currentAccount =
            accountStore.ownerKey === ownerKey
              ? accountStore.accounts.find((item) => item.uuid === account.uuid)
              : undefined;
          if (currentAccount == null) {
            setSaveStatus("error");
            return;
          }
          setHistoryDepthState({
            accountUuid: currentAccount.uuid,
            saved: currentAccount.settings.historyDepth,
            draft: historyDepth,
          });
          setSaveStatus(
            currentAccount.settings.historyDepth === historyDepth ? "success" : "dirty",
          );
          return;
        }
        setHistoryDepthState({
          accountUuid: updatedAccount.uuid,
          saved: updatedAccount.settings.historyDepth,
          draft: updatedAccount.settings.historyDepth,
        });
        await refresh(controller.signal);
        if (
          mountedRef.current &&
          !isWorkspaceRuntimeRequestInvalidated(
            requestContext,
            currentRuntimeContext,
            controller.signal,
          )
        ) {
          setSaveStatus("success");
        }
      })
      .catch((error: unknown) => {
        if (
          !mountedRef.current ||
          isWorkspaceRuntimeRequestInvalidated(
            requestContext,
            currentRuntimeContext,
            controller.signal,
          )
        ) {
          return;
        }
        setSaveStatus(
          error instanceof MessengerApiError && error.status === 412 ? "conflict" : "error",
        );
      })
      .finally(() => {
        if (settingsRequestRef.current === controller) {
          settingsRequestRef.current = null;
          settingsSavingRef.current = false;
          if (mountedRef.current) {
            setSaveStatus((current) => (current === "saving" ? "dirty" : current));
          }
        }
      });
  }, [
    account.etag,
    account.settings.selectionMode,
    account.uuid,
    historyDepth,
    historyDepthDirty,
    refresh,
    runtimeContext,
    settingsBusy,
    submitting,
  ]);

  const reloadAccountSettings = useCallback(() => {
    if (
      refreshingAccount ||
      saveStatus === "saving" ||
      settingsRequestRef.current != null ||
      submitting
    ) {
      return;
    }
    const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
    if (requestContext == null) return;
    const ownerKey = workspaceRuntimeOwnerKey(requestContext);
    const controller = new AbortController();
    settingsRequestRef.current = controller;
    setRefreshingAccount(true);

    void getExternalAccount(
      buildMessengerRequestOptions(runtimeContext, undefined, controller.signal),
      account.uuid,
    )
      .then((snapshot) => {
        if (
          !mountedRef.current ||
          isWorkspaceRuntimeRequestInvalidated(
            requestContext,
            currentRuntimeContext,
            controller.signal,
          )
        ) {
          return;
        }
        const updatedAccount = adaptWorkspaceExternalAccountDto(snapshot.account, snapshot.etag);
        if (!useExternalAccountsStore.getState().upsertAccountForOwner(ownerKey, updatedAccount)) {
          return;
        }
        setHistoryDepthState((current) => ({
          accountUuid: updatedAccount.uuid,
          saved: updatedAccount.settings.historyDepth,
          draft:
            current.accountUuid === updatedAccount.uuid
              ? current.draft
              : updatedAccount.settings.historyDepth,
        }));
        setSaveStatus("dirty");
      })
      .catch(() => {
        if (
          mountedRef.current &&
          !isWorkspaceRuntimeRequestInvalidated(
            requestContext,
            currentRuntimeContext,
            controller.signal,
          )
        ) {
          setSaveStatus("error");
        }
      })
      .finally(() => {
        if (settingsRequestRef.current === controller) {
          settingsRequestRef.current = null;
          if (mountedRef.current) setRefreshingAccount(false);
        }
      });
  }, [account.uuid, refreshingAccount, runtimeContext, saveStatus, submitting]);

  return {
    chats: visibleChats,
    loadStatus,
    loadError,
    query,
    pending,
    failed,
    submitting,
    historyDepth,
    historyDepthDirty,
    saveStatus: normalizedSaveStatus,
    settingsBusy,
    selectionBlockedBySettings,
    canSaveHistoryDepth: historyDepthDirty && !settingsBusy && !submitting,
    manualSelectionEnabled,
    readyCount,
    selectedCount: selectedChats.length,
    setQuery,
    toggle,
    changeHistoryDepth,
    saveHistoryDepth,
    reloadAccountSettings,
    start,
    retryFailed,
    refresh: () => void refresh(),
  };
}

export type ConfigureExternalChatsViewModel = ReturnType<typeof useConfigureExternalChats>;
