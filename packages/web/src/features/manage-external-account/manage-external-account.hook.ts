import { useCallback, useEffect, useState } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import type {
  ExternalAccount,
  ExternalAccountHistoryDepth,
  ExternalAccountSelectionMode,
} from "~/entities/external-account/external-account.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  deselectExternalChat,
  getExternalAccounts,
  getExternalChats,
  selectExternalChat,
  updateExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-accounts.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";

export type ExternalAccountSyncError = "load" | "save" | "conflict" | "chat";

export interface ExternalAccountSyncViewModel {
  chats: WorkspaceExternalChatDto[];
  selectionMode: ExternalAccountSelectionMode;
  historyDepth: ExternalAccountHistoryDepth;
  loadingChats: boolean;
  savingSettings: boolean;
  changingChatUuid: string | null;
  saved: boolean;
  error: ExternalAccountSyncError | null;
  setSelectionMode: (value: ExternalAccountSelectionMode) => void;
  setHistoryDepth: (value: ExternalAccountHistoryDepth) => void;
  saveSettings: () => void;
  toggleChat: (chat: WorkspaceExternalChatDto) => void;
  reloadChats: () => void;
}

function syncError(error: unknown, fallback: ExternalAccountSyncError): ExternalAccountSyncError {
  if (error instanceof MessengerApiError && (error.status === 409 || error.status === 412)) {
    return "conflict";
  }
  return fallback;
}

function replaceChat(
  chats: WorkspaceExternalChatDto[],
  updated: WorkspaceExternalChatDto,
): WorkspaceExternalChatDto[] {
  return chats.map((candidate) => (candidate.uuid === updated.uuid ? updated : candidate));
}

function isConflict(error: unknown): boolean {
  return error instanceof MessengerApiError && (error.status === 409 || error.status === 412);
}

export function useExternalAccountSync(
  runtimeContext: WorkspaceRuntimeContext,
  account: ExternalAccount,
): ExternalAccountSyncViewModel {
  const [chats, setChats] = useState<WorkspaceExternalChatDto[]>([]);
  const [selectionMode, setSelectionMode] = useState(account.selectionMode);
  const [historyDepth, setHistoryDepth] = useState(account.historyDepth);
  const [revision, setRevision] = useState(account.revision);
  const [loadingChats, setLoadingChats] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [changingChatUuid, setChangingChatUuid] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ExternalAccountSyncError | null>(null);

  const loadChats = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingChats(true);
      setError(null);
      try {
        const nextChats = await getExternalChats(
          buildMessengerRequestOptions(runtimeContext, undefined, signal),
          account.uuid,
        );
        if (signal?.aborted !== true) setChats(nextChats);
      } catch (requestError) {
        if (signal?.aborted !== true) setError(syncError(requestError, "load"));
      } finally {
        if (signal?.aborted !== true) setLoadingChats(false);
      }
    },
    [account.uuid, runtimeContext],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadChats(controller.signal);
    });
    return () => controller.abort();
  }, [loadChats]);

  const saveSettings = useCallback(() => {
    if (savingSettings) return;
    setSavingSettings(true);
    setSaved(false);
    setError(null);
    const options = buildMessengerRequestOptions(runtimeContext);
    const body = {
      settings: {
        kind: "zulip" as const,
        selection_mode: selectionMode,
        history_depth: historyDepth,
        default_project_id: runtimeContext.projectId,
      },
    };
    const updateCurrentRevision = async () => {
      let expectedRevision = revision;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await updateExternalAccount(options, account.uuid, body, expectedRevision);
        } catch (requestError) {
          if (!isConflict(requestError) || attempt === 2) throw requestError;
          const accounts = await getExternalAccounts(options);
          const current = accounts.find((candidate) => candidate.uuid === account.uuid);
          if (current == null) throw requestError;
          expectedRevision = current.revision;
        }
      }
      throw new Error("External account update retry exhausted");
    };
    void updateCurrentRevision()
      .then(async (updated) => {
        setRevision(updated.revision);
        setSaved(true);
        await refreshExternalAccounts({ runtimeContext });
      })
      .catch((requestError: unknown) => {
        setError(syncError(requestError, "save"));
      })
      .finally(() => setSavingSettings(false));
  }, [account.uuid, historyDepth, revision, runtimeContext, savingSettings, selectionMode]);

  const toggleChat = useCallback(
    (chat: WorkspaceExternalChatDto) => {
      if (changingChatUuid != null || selectionMode !== "explicit") return;
      setChangingChatUuid(chat.uuid);
      setError(null);
      const options = buildMessengerRequestOptions(runtimeContext);
      const request = chat.selected
        ? deselectExternalChat(options, chat.uuid)
        : selectExternalChat(options, chat.uuid, runtimeContext.projectId);
      void request
        .then((updated) => {
          setChats((current) => replaceChat(current, updated));
        })
        .catch((requestError: unknown) => setError(syncError(requestError, "chat")))
        .finally(() => setChangingChatUuid(null));
    },
    [changingChatUuid, runtimeContext, selectionMode],
  );

  const reloadChats = useCallback(() => {
    void loadChats();
  }, [loadChats]);

  return {
    chats,
    selectionMode,
    historyDepth,
    loadingChats,
    savingSettings,
    changingChatUuid,
    saved,
    error,
    setSelectionMode,
    setHistoryDepth,
    saveSettings,
    toggleChat,
    reloadChats,
  };
}
