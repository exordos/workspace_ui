import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adaptWorkspaceExternalAccountDto } from "~/entities/external-account/external-account-adapters.lib";
import { useExternalAccountsStore } from "~/entities/external-account/external-account.model";
import type {
  ExternalAccount,
  ExternalAccountHistoryDepth,
  ExternalAccountSelectionMode,
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

interface ExternalAccountSettingsDraftState {
  scopeKey: string;
  accountUuid: string;
  etag: string;
  saved: {
    historyDepth: ExternalAccountHistoryDepth;
    selectionMode: ExternalAccountSelectionMode;
  };
  draft: {
    historyDepth: ExternalAccountHistoryDepth;
    selectionMode: ExternalAccountSelectionMode;
  };
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
  const [settingsState, setSettingsState] = useState<ExternalAccountSettingsDraftState>(() => ({
    scopeKey,
    accountUuid: account.uuid,
    etag: account.etag,
    saved: {
      historyDepth: account.settings.historyDepth,
      selectionMode: account.settings.selectionMode,
    },
    draft: {
      historyDepth: account.settings.historyDepth,
      selectionMode: account.settings.selectionMode,
    },
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
    settingsRequestRef.current?.abort();
    settingsRequestRef.current = null;
    settingsSavingRef.current = false;
    setRefreshingAccount(false);
    setSaveStatus("clean");
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
    setSettingsState((current) => {
      const incoming = {
        historyDepth: account.settings.historyDepth,
        selectionMode: account.settings.selectionMode,
      };
      if (current.scopeKey !== scopeKey || current.accountUuid !== account.uuid) {
        return {
          scopeKey,
          accountUuid: account.uuid,
          etag: account.etag,
          saved: incoming,
          draft: incoming,
        };
      }
      const historyDepthDirty = current.draft.historyDepth !== current.saved.historyDepth;
      const selectionModeDirty = current.draft.selectionMode !== current.saved.selectionMode;
      return {
        ...current,
        etag: account.etag,
        saved: incoming,
        draft: {
          historyDepth: historyDepthDirty ? current.draft.historyDepth : incoming.historyDepth,
          selectionMode: selectionModeDirty ? current.draft.selectionMode : incoming.selectionMode,
        },
      };
    });
    if (account.settings.selectionMode === "all") {
      setSubmissionState(emptySubmissionState(scopeKey));
    }
  }, [
    account.etag,
    account.settings.historyDepth,
    account.settings.selectionMode,
    account.uuid,
    scopeKey,
  ]);

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
      const settingsDirty =
        settingsState.draft.historyDepth !== settingsState.saved.historyDepth ||
        settingsState.draft.selectionMode !== settingsState.saved.selectionMode;
      if (
        settingsState.saved.selectionMode !== "explicit" ||
        settingsDirty ||
        settingsSavingRef.current ||
        refreshingAccount ||
        submitting
      ) {
        return;
      }
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
    [refreshingAccount, scopeKey, settingsState, submitting],
  );

  const historyDepth = settingsState.draft.historyDepth;
  const selectionMode = settingsState.draft.selectionMode;
  const historyDepthDirty = settingsState.draft.historyDepth !== settingsState.saved.historyDepth;
  const selectionModeDirty =
    settingsState.draft.selectionMode !== settingsState.saved.selectionMode;
  const settingsDirty = historyDepthDirty || selectionModeDirty;
  const settingsBusy = saveStatus === "saving" || refreshingAccount;
  const manualSelectionEnabled = settingsState.saved.selectionMode === "explicit";
  const selectionBlockedBySettings = settingsDirty || settingsBusy || !manualSelectionEnabled;

  const changeHistoryDepth = useCallback(
    (value: ExternalAccountHistoryDepth) => {
      if (settingsSavingRef.current || refreshingAccount || submitting) return;
      setSettingsState((current) => ({
        ...current,
        draft: { ...current.draft, historyDepth: value },
      }));
      setSaveStatus("dirty");
    },
    [refreshingAccount, submitting],
  );

  const changeSelectionMode = useCallback(
    (value: ExternalAccountSelectionMode) => {
      if (settingsSavingRef.current || refreshingAccount || submitting) return;
      setSettingsState((current) => ({
        ...current,
        draft: { ...current.draft, selectionMode: value },
      }));
      setSaveStatus("dirty");
    },
    [refreshingAccount, submitting],
  );

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
  const selectableVisibleChatUuids = useMemo(
    () =>
      visibleChats
        .filter((chat) => !chat.selected && !chat.transitionPending)
        .map((chat) => chat.uuid),
    [visibleChats],
  );
  const pendingVisibleCount = selectableVisibleChatUuids.reduce(
    (count, chatUuid) => count + (pending.has(chatUuid) ? 1 : 0),
    0,
  );
  let selectAllState: "none" | "some" | "all" = "none";
  if (pendingVisibleCount > 0) {
    selectAllState = pendingVisibleCount === selectableVisibleChatUuids.length ? "all" : "some";
  }
  const toggleAllVisible = useCallback(() => {
    if (
      settingsState.saved.selectionMode !== "explicit" ||
      settingsDirty ||
      settingsSavingRef.current ||
      refreshingAccount ||
      submitting ||
      selectableVisibleChatUuids.length === 0
    ) {
      return;
    }
    setSubmissionState((currentState) => {
      const current =
        currentState.scopeKey === scopeKey ? currentState : emptySubmissionState(scopeKey);
      const nextPending = new Set(current.pending);
      const nextFailed = new Set(current.failed);
      const shouldClear = selectableVisibleChatUuids.every((chatUuid) => nextPending.has(chatUuid));
      for (const chatUuid of selectableVisibleChatUuids) {
        if (shouldClear) nextPending.delete(chatUuid);
        else nextPending.add(chatUuid);
        nextFailed.delete(chatUuid);
      }
      return {
        ...current,
        pending: nextPending,
        failed: nextFailed,
      };
    });
  }, [
    refreshingAccount,
    scopeKey,
    selectableVisibleChatUuids,
    settingsDirty,
    settingsState.saved.selectionMode,
    submitting,
  ]);
  const selectedChats = chats.filter((chat) => chat.selected);
  const readyCount = selectedChats.filter((chat) => chat.status === "live").length;
  let normalizedSaveStatus = saveStatus;
  if (saveStatus === "clean" && settingsDirty) normalizedSaveStatus = "dirty";
  if (saveStatus === "dirty" && !settingsDirty) normalizedSaveStatus = "clean";

  const saveSettings = useCallback(() => {
    if (!settingsDirty || settingsBusy || settingsRequestRef.current != null || submitting) {
      return;
    }

    const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
    if (requestContext == null) return;
    const ownerKey = workspaceRuntimeOwnerKey(requestContext);
    const controller = new AbortController();
    const historyDepthWasDirty = historyDepthDirty;
    const selectionModeWasDirty = selectionModeDirty;
    settingsRequestRef.current = controller;
    settingsSavingRef.current = true;
    setSaveStatus("saving");

    void updateExternalAccount(
      buildMessengerRequestOptions(runtimeContext, undefined, controller.signal),
      account.uuid,
      {
        settings: {
          kind: "zulip",
          selection_mode: selectionMode,
          history_depth: historyDepth,
          default_project_id: runtimeContext.projectId,
        },
      },
      settingsState.etag,
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
          const mergedDraft = {
            historyDepth: historyDepthWasDirty
              ? historyDepth
              : currentAccount.settings.historyDepth,
            selectionMode: selectionModeWasDirty
              ? selectionMode
              : currentAccount.settings.selectionMode,
          };
          setSettingsState({
            scopeKey,
            accountUuid: currentAccount.uuid,
            etag: currentAccount.etag,
            saved: {
              historyDepth: currentAccount.settings.historyDepth,
              selectionMode: currentAccount.settings.selectionMode,
            },
            draft: mergedDraft,
          });
          const matchesSubmitted =
            currentAccount.settings.historyDepth === mergedDraft.historyDepth &&
            currentAccount.settings.selectionMode === mergedDraft.selectionMode;
          setSaveStatus(matchesSubmitted ? "success" : "dirty");
          if (currentAccount.settings.selectionMode === "all") {
            setSubmissionState(emptySubmissionState(scopeKey));
          }
          return;
        }
        setSettingsState({
          scopeKey,
          accountUuid: updatedAccount.uuid,
          etag: updatedAccount.etag,
          saved: {
            historyDepth: updatedAccount.settings.historyDepth,
            selectionMode: updatedAccount.settings.selectionMode,
          },
          draft: {
            historyDepth: updatedAccount.settings.historyDepth,
            selectionMode: updatedAccount.settings.selectionMode,
          },
        });
        if (updatedAccount.settings.selectionMode === "all") {
          setSubmissionState(emptySubmissionState(scopeKey));
        }
        setSaveStatus("success");
        void refresh(controller.signal);
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
    account.uuid,
    historyDepth,
    historyDepthDirty,
    refresh,
    runtimeContext,
    scopeKey,
    selectionMode,
    selectionModeDirty,
    settingsDirty,
    settingsState.etag,
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
        const accountStore = useExternalAccountsStore.getState();
        let authoritativeAccount = updatedAccount;
        if (!accountStore.upsertAccountForOwner(ownerKey, updatedAccount)) {
          const currentAccount =
            accountStore.ownerKey === ownerKey
              ? accountStore.accounts.find((item) => item.uuid === account.uuid)
              : undefined;
          if (currentAccount == null) {
            setSaveStatus("error");
            return;
          }
          authoritativeAccount = currentAccount;
        }
        setSettingsState((current) => ({
          scopeKey,
          accountUuid: authoritativeAccount.uuid,
          etag: authoritativeAccount.etag,
          saved: {
            historyDepth: authoritativeAccount.settings.historyDepth,
            selectionMode: authoritativeAccount.settings.selectionMode,
          },
          draft:
            current.scopeKey === scopeKey && current.accountUuid === updatedAccount.uuid
              ? {
                  historyDepth:
                    current.draft.historyDepth !== current.saved.historyDepth
                      ? current.draft.historyDepth
                      : authoritativeAccount.settings.historyDepth,
                  selectionMode:
                    current.draft.selectionMode !== current.saved.selectionMode
                      ? current.draft.selectionMode
                      : authoritativeAccount.settings.selectionMode,
                }
              : {
                  historyDepth: authoritativeAccount.settings.historyDepth,
                  selectionMode: authoritativeAccount.settings.selectionMode,
                },
        }));
        if (authoritativeAccount.settings.selectionMode === "all") {
          setSubmissionState(emptySubmissionState(scopeKey));
        }
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
  }, [account.uuid, refreshingAccount, runtimeContext, saveStatus, scopeKey, submitting]);

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
    selectionMode,
    selectionModeDirty,
    settingsDirty,
    saveStatus: normalizedSaveStatus,
    settingsBusy,
    selectionBlockedBySettings,
    canSaveSettings: settingsDirty && !settingsBusy && !submitting,
    manualSelectionEnabled,
    selectableVisibleCount: selectableVisibleChatUuids.length,
    selectAllState,
    readyCount,
    selectedCount: selectedChats.length,
    setQuery,
    toggle,
    toggleAllVisible,
    changeHistoryDepth,
    changeSelectionMode,
    saveSettings,
    reloadAccountSettings,
    start,
    retryFailed,
    refresh: () => void refresh(),
  };
}

export type ConfigureExternalChatsViewModel = ReturnType<typeof useConfigureExternalChats>;
