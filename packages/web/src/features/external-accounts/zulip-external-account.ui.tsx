import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadCurrentExternalAccountsSnapshot,
  persistCurrentExternalAccountsSnapshot,
} from "~/features/external-accounts/external-accounts-cache.db";
import {
  createZulipExternalAccount,
  deleteZulipExternalAccount,
  deselectExternalChat,
  discardExternalOperation,
  disconnectZulipExternalAccount,
  fetchExternalChats,
  fetchExternalOperations,
  fetchZulipExternalAccount,
  logExternalAccountRefreshFailure,
  moveExternalChat,
  parseExternalRealtimeUpdate,
  reconnectZulipExternalAccount,
  retryExternalOperation,
  selectExternalChat,
  updateZulipExternalAccount,
} from "~/features/external-accounts/external-accounts.api";
import type {
  ExternalAccountMutationErrorKind,
  ExternalChat,
  ExternalHistoryDepth,
  ExternalOperation,
  ExternalSelectionMode,
  ZulipExternalAccount,
} from "~/features/external-accounts/external-accounts.types";
import {
  EXTERNAL_CAPABILITY,
  isExternalCapabilityAvailable,
} from "~/features/external-accounts/external-capabilities.lib";
import { t } from "~/i18n/i18n";
import { WORKSPACE_PROJECT_UUID } from "~/shared/config/workspace-project";
import { createMessageId } from "~/shared/lib/message-id.lib";
import { isValidEmail, isValidRealmUrl, isValidUrl } from "~/shared/lib/validation";
import { AccessibleAlertDialog } from "~/shared/ui/accessible-alert-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { SectionLabel } from "~/shared/ui/section-label.ui";
import { subscribeExternalAccountUpdates } from "./external-account-realtime.lib";

export interface ZulipExternalAccountCardProps {
  compact?: boolean;
}

type FormMode = "connect" | "reconnect" | "settings" | null;

const HISTORY_DEPTHS: ExternalHistoryDepth[] = ["new", "7_days", "30_days", "90_days", "all"];

function mapMutationError(kind: ExternalAccountMutationErrorKind): string {
  if (kind === "forbidden") return t("settings.externalAccountForbidden");
  if (kind === "conflict") return t("settings.externalAccountConflict");
  if (kind === "precondition") return t("settings.externalAccountPrecondition");
  if (kind === "invalid") return t("settings.externalAccountInvalid");
  return t("settings.externalAccountSaveError");
}

function capabilityReason(account: ZulipExternalAccount): string[] {
  return Object.entries(account.capabilities)
    .filter(([, capability]) => !capability.available)
    .map(([name, capability]) => capability.unavailableReason?.message ?? name);
}

function externalChatToggleLabel(saving: boolean, selected: boolean): string {
  if (saving) return t("settings.externalAccountSaving");
  return selected ? t("settings.externalChatDeselect") : t("settings.externalChatSelect");
}

interface ExternalChatRowProps {
  chat: ExternalChat;
  projectId: string;
  disabled: boolean;
  onChanged: (chat: ExternalChat) => void;
  onError: (message: string) => void;
}

const ExternalChatRow = React.memo<ExternalChatRowProps>(function ExternalChatRow({
  chat,
  projectId,
  disabled,
  onChanged,
  onError,
}) {
  const [saving, setSaving] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveProjectId, setMoveProjectId] = useState(chat.projectId ?? projectId);
  const toggleLabel = externalChatToggleLabel(saving, chat.selected);
  const originalUrl =
    chat.source.originalUrl != null && isValidUrl(chat.source.originalUrl)
      ? chat.source.originalUrl
      : null;
  const unavailableReasons = useMemo(
    () =>
      Object.entries(chat.capabilities)
        .filter(([, capability]) => !capability.available)
        .map(([name, capability]) => capability.unavailableReason?.message ?? name),
    [chat.capabilities],
  );
  const handleToggle = useCallback(() => {
    if (disabled || saving) return;
    setSaving(true);
    const request = chat.selected
      ? deselectExternalChat(chat.uuid)
      : selectExternalChat(chat.uuid, projectId);
    void request
      .then((result) => {
        if (!result.ok) {
          onError(mapMutationError(result.kind));
          return;
        }
        onChanged(result.value);
      })
      .catch(() => onError(t("settings.externalChatSaveError")))
      .finally(() => setSaving(false));
  }, [chat.selected, chat.uuid, disabled, onChanged, onError, projectId, saving]);
  const handleMove = useCallback(() => {
    if (disabled || saving || !chat.selected || moveProjectId.trim().length === 0) return;
    setSaving(true);
    void moveExternalChat(chat.uuid, moveProjectId.trim(), chat.etag)
      .then((result) => {
        if (!result.ok) {
          onError(mapMutationError(result.kind));
          return;
        }
        onChanged(result.value);
        setMoveOpen(false);
      })
      .catch(() => onError(t("settings.externalChatSaveError")))
      .finally(() => setSaving(false));
  }, [chat.etag, chat.selected, chat.uuid, disabled, moveProjectId, onChanged, onError, saving]);

  return (
    <li
      className="flex min-h-11 flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-bg p-2"
      data-testid={`external-chat-${chat.uuid}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{chat.displayName}</p>
        <p className="truncate text-xs text-text-secondary">{chat.status}</p>
        {chat.safeError != null && (
          <p className="truncate text-xs text-notice-base">{chat.safeError}</p>
        )}
        {unavailableReasons.map((reason) => (
          <p key={reason} className="truncate text-xs text-notice-base">
            {reason}
          </p>
        ))}
        {originalUrl != null && (
          <a
            className="text-xs text-accent underline"
            href={originalUrl}
            target="_blank"
            rel="noreferrer"
            data-testid={`external-chat-original-${chat.uuid}`}
          >
            {t("settings.externalOperationOpenOriginal")}
          </a>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || saving}
          onClick={handleToggle}
          aria-label={
            chat.selected
              ? t("settings.externalChatDeselectNamed", { name: chat.displayName })
              : t("settings.externalChatSelectNamed", { name: chat.displayName })
          }
          data-testid={`external-chat-toggle-${chat.uuid}`}
        >
          {toggleLabel}
        </button>
        {chat.selected && (
          <button
            type="button"
            className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
            disabled={disabled || saving}
            onClick={() => setMoveOpen((open) => !open)}
            data-testid={`external-chat-move-open-${chat.uuid}`}
          >
            {t("settings.externalChatMove")}
          </button>
        )}
      </div>
      {moveOpen && (
        <div className="basis-full rounded-lg border border-border-subtle bg-bg-elevated p-2">
          <label className="text-xs text-text-secondary">
            {t("settings.externalChatProject")}
            <input
              type="text"
              value={moveProjectId}
              onChange={(event) => setMoveProjectId(event.target.value)}
              className="mt-1 w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary"
              data-testid={`external-chat-move-project-${chat.uuid}`}
            />
          </label>
          <button
            type="button"
            className="mt-2 min-h-11 rounded-lg bg-accent px-3 text-sm text-on-accent disabled:opacity-50"
            disabled={saving || moveProjectId.trim().length === 0}
            onClick={handleMove}
            data-testid={`external-chat-move-submit-${chat.uuid}`}
          >
            {t("settings.externalChatMove")}
          </button>
        </div>
      )}
    </li>
  );
});

interface ExternalOperationRowProps {
  operation: ExternalOperation;
  onChanged: (operation: ExternalOperation) => void;
  onDiscarded: (uuid: string) => void;
  onError: (message: string) => void;
}

const ExternalOperationRow = React.memo<ExternalOperationRowProps>(function ExternalOperationRow({
  operation,
  onChanged,
  onDiscarded,
  onError,
}) {
  const [saving, setSaving] = useState(false);
  const [retryConfirmation, setRetryConfirmation] = useState(false);
  const originalUrl =
    operation.originalUrl != null && isValidUrl(operation.originalUrl)
      ? operation.originalUrl
      : null;
  const executeRetry = useCallback(
    (confirmDuplicateRisk: boolean) => {
      if (saving || !operation.canRetry) return;
      setSaving(true);
      void retryExternalOperation(operation.uuid, { confirmDuplicateRisk })
        .then((result) => {
          if (!result.ok) {
            onError(mapMutationError(result.kind));
            return;
          }
          onChanged(result.value);
          setRetryConfirmation(false);
        })
        .catch(() => onError(t("settings.externalOperationSaveError")))
        .finally(() => setSaving(false));
    },
    [onChanged, onError, operation.canRetry, operation.uuid, saving],
  );
  const handleRetryClick = useCallback(() => {
    if (operation.retryRequiresConfirmation) {
      setRetryConfirmation(true);
      return;
    }
    executeRetry(false);
  }, [executeRetry, operation.retryRequiresConfirmation]);
  const handleDiscard = useCallback(() => {
    if (saving || !operation.canDiscard) return;
    setSaving(true);
    void discardExternalOperation(operation.uuid)
      .then((result) => {
        if (!result.ok) {
          onError(mapMutationError(result.kind));
          return;
        }
        onDiscarded(operation.uuid);
      })
      .catch(() => onError(t("settings.externalOperationSaveError")))
      .finally(() => setSaving(false));
  }, [onDiscarded, onError, operation.canDiscard, operation.uuid, saving]);

  return (
    <li
      className="rounded-lg border border-border-subtle bg-bg p-3"
      data-testid={`external-operation-${operation.uuid}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{operation.action}</p>
          <p className="text-xs text-text-secondary">{operation.status}</p>
          {operation.status === "manual_reconciliation_required" && (
            <span
              className="border-notice-base/40 bg-notice-base/10 mt-1 inline-flex rounded-sm border px-1.5 py-0.5 text-xs font-semibold text-notice-base"
              data-testid={`external-operation-manual-${operation.uuid}`}
            >
              {t("settings.externalOperationManualReconciliation")}
            </span>
          )}
          {operation.safeError != null && (
            <p className="mt-1 text-xs text-notice-base">{operation.safeError}</p>
          )}
          {originalUrl != null && (
            <a
              className="mt-1 block text-xs text-accent underline"
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              data-testid={`external-operation-original-${operation.uuid}`}
            >
              {t("settings.externalOperationOpenOriginal")}
            </a>
          )}
        </div>
        <div className="flex gap-2">
          {operation.canRetry && (
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
              disabled={saving}
              onClick={handleRetryClick}
              data-testid={`external-operation-retry-${operation.uuid}`}
            >
              {t("settings.externalOperationRetry")}
            </button>
          )}
          {operation.canDiscard && (
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-notice-base disabled:opacity-50"
              disabled={saving}
              onClick={handleDiscard}
              data-testid={`external-operation-discard-${operation.uuid}`}
            >
              {t("settings.externalOperationDiscard")}
            </button>
          )}
        </div>
      </div>
      {retryConfirmation && (
        <AccessibleAlertDialog
          className="border-notice-base/40 bg-notice-base/10 mt-3 rounded-lg border p-3"
          label={t("settings.externalOperationRetryConfirmTitle")}
          onDismiss={() => setRetryConfirmation(false)}
          data-testid={`external-operation-retry-confirmation-${operation.uuid}`}
        >
          <p className="text-xs text-text-primary">
            {t("settings.externalOperationRetryConfirmDescription")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg bg-notice-base px-3 text-sm text-on-accent disabled:opacity-50"
              disabled={saving}
              onClick={() => executeRetry(true)}
              data-testid={`external-operation-retry-confirm-${operation.uuid}`}
            >
              {t("settings.externalOperationRetryConfirm")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-secondary"
              disabled={saving}
              onClick={() => setRetryConfirmation(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </AccessibleAlertDialog>
      )}
    </li>
  );
});

export const ZulipExternalAccountCard: React.FC<ZulipExternalAccountCardProps> = ({
  compact = false,
}) => {
  const [account, setAccount] = useState<ZulipExternalAccount | null>(null);
  const [chats, setChats] = useState<ExternalChat[]>([]);
  const [operations, setOperations] = useState<ExternalOperation[]>([]);
  const [serverUrl, setServerUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectionMode, setSelectionMode] = useState<ExternalSelectionMode>("explicit");
  const [historyDepth, setHistoryDepth] = useState<ExternalHistoryDepth>("30_days");
  const [defaultProjectId, setDefaultProjectId] = useState(WORKSPACE_PROJECT_UUID);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const formDirtyRef = useRef(false);

  const hydrateForm = useCallback(
    (nextAccount: ZulipExternalAccount | null, preserveDirty = false) => {
      if (preserveDirty && formDirtyRef.current) return;
      setServerUrl(nextAccount?.settings.serverUrl ?? "");
      setEmail(nextAccount?.settings.email ?? "");
      setApiKey("");
      setSelectionMode(nextAccount?.settings.selectionMode ?? "explicit");
      setHistoryDepth(nextAccount?.settings.historyDepth ?? "30_days");
      setDefaultProjectId(nextAccount?.settings.defaultProjectId ?? WORKSPACE_PROJECT_UUID);
      formDirtyRef.current = false;
    },
    [],
  );

  const openForm = useCallback((mode: Exclude<FormMode, null>) => {
    formDirtyRef.current = false;
    setFormMode(mode);
  }, []);

  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    let realtimeGeneration = 0;
    const initialGeneration = realtimeGeneration;
    const loadSnapshot = (hydrate: boolean) => {
      controller?.abort();
      const requestController = new AbortController();
      const requestGeneration = realtimeGeneration;
      controller = requestController;
      void fetchZulipExternalAccount({ signal: requestController.signal })
        .then(async (nextAccount) => {
          if (requestController.signal.aborted || requestGeneration !== realtimeGeneration) {
            return;
          }
          setAccount(nextAccount);
          if (hydrate) hydrateForm(nextAccount, true);
          if (nextAccount == null || compact) {
            setChats([]);
            setOperations([]);
            setCacheReady(true);
            return;
          }
          const [nextChats, nextOperations] = await Promise.all([
            fetchExternalChats(nextAccount.uuid, requestController.signal),
            fetchExternalOperations(nextAccount.uuid, requestController.signal),
          ]);
          if (requestController.signal.aborted || requestGeneration !== realtimeGeneration) {
            return;
          }
          setChats(nextChats);
          setOperations(nextOperations);
          setCacheReady(true);
        })
        .catch((reason: unknown) => {
          if (requestController.signal.aborted || requestGeneration !== realtimeGeneration) {
            return;
          }
          logExternalAccountRefreshFailure(reason);
          setError(t("settings.externalAccountLoadError"));
        })
        .finally(() => {
          if (!requestController.signal.aborted && requestGeneration === realtimeGeneration) {
            setIsLoading(false);
          }
        });
    };
    void loadCurrentExternalAccountsSnapshot().then((cached) => {
      if (disposed) return;
      if (cached != null && realtimeGeneration === initialGeneration) {
        setAccount(cached.account);
        setChats(cached.chats);
        setOperations(cached.operations);
        hydrateForm(cached.account);
        setIsLoading(false);
        setCacheReady(true);
      }
      loadSnapshot(true);
    });
    const unsubscribe = subscribeExternalAccountUpdates((payload) => {
      realtimeGeneration += 1;
      const update = parseExternalRealtimeUpdate(payload);
      if (update == null) {
        loadSnapshot(true);
        return;
      }
      setCacheReady(true);
      setIsLoading(false);
      if (update.resource === "account") {
        if (update.action === "delete") {
          setAccount(null);
          setChats([]);
          setOperations([]);
          hydrateForm(null, true);
        } else {
          setAccount(update.value);
          hydrateForm(update.value, true);
        }
        return;
      }
      if (update.resource === "chat") {
        setChats((current) =>
          update.action === "delete"
            ? current.filter((chat) => chat.uuid !== update.uuid)
            : [...current.filter((chat) => chat.uuid !== update.value.uuid), update.value],
        );
        return;
      }
      setOperations((current) =>
        update.action === "delete"
          ? current.filter((operation) => operation.uuid !== update.uuid)
          : [...current.filter((operation) => operation.uuid !== update.value.uuid), update.value],
      );
    });
    return () => {
      disposed = true;
      controller?.abort();
      unsubscribe();
    };
  }, [compact, hydrateForm]);

  useEffect(() => {
    if (compact || !cacheReady) return;
    void persistCurrentExternalAccountsSnapshot({ account, chats, operations });
  }, [account, cacheReady, chats, compact, operations]);

  const showError = useCallback((message: string) => {
    setError(message);
    setSuccess(null);
  }, []);

  const replaceChat = useCallback((nextChat: ExternalChat) => {
    setChats((current) => current.map((chat) => (chat.uuid === nextChat.uuid ? nextChat : chat)));
  }, []);
  const replaceOperation = useCallback((nextOperation: ExternalOperation) => {
    setOperations((current) =>
      current.map((operation) =>
        operation.uuid === nextOperation.uuid ? nextOperation : operation,
      ),
    );
  }, []);
  const removeOperation = useCallback((uuid: string) => {
    setOperations((current) => current.filter((operation) => operation.uuid !== uuid));
  }, []);

  const validateCredentialForm = useCallback((): boolean => {
    if (!isValidRealmUrl(serverUrl.trim()) || !isValidEmail(email) || apiKey.trim().length === 0) {
      showError(t("settings.externalAccountRequired"));
      return false;
    }
    return true;
  }, [apiKey, email, serverUrl, showError]);

  const handleConnectOrReconnect = useCallback(() => {
    if (isSaving || !validateCredentialForm()) return;
    if (formMode === "reconnect" && account?.etag == null) {
      showError(t("settings.externalAccountPrecondition"));
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    const request =
      formMode === "reconnect" && account != null
        ? reconnectZulipExternalAccount({
            uuid: account.uuid,
            etag: account.etag ?? "",
            serverUrl: serverUrl.trim(),
            email: email.trim(),
            apiKey: apiKey.trim(),
          })
        : createZulipExternalAccount({
            uuid: createMessageId(),
            serverUrl: serverUrl.trim(),
            email: email.trim(),
            apiKey: apiKey.trim(),
            selectionMode,
            historyDepth,
            defaultProjectId,
          });
    void request
      .then((result) => {
        if (!result.ok) {
          showError(mapMutationError(result.kind));
          return;
        }
        setAccount(result.value);
        hydrateForm(result.value);
        setFormMode(null);
        setSuccess(t("settings.externalAccountSaved"));
      })
      .catch(() => showError(t("settings.externalAccountSaveError")))
      .finally(() => setIsSaving(false));
  }, [
    account,
    apiKey,
    defaultProjectId,
    email,
    formMode,
    historyDepth,
    hydrateForm,
    isSaving,
    selectionMode,
    serverUrl,
    showError,
    validateCredentialForm,
  ]);

  const handleUpdateSettings = useCallback(() => {
    if (account?.etag == null || isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    void updateZulipExternalAccount({
      uuid: account.uuid,
      etag: account.etag,
      selectionMode,
      historyDepth,
      defaultProjectId,
    })
      .then((result) => {
        if (!result.ok) {
          showError(mapMutationError(result.kind));
          return;
        }
        setAccount(result.value);
        hydrateForm(result.value);
        setFormMode(null);
        setSuccess(t("settings.externalAccountSettingsSaved"));
      })
      .catch(() => showError(t("settings.externalAccountSaveError")))
      .finally(() => setIsSaving(false));
  }, [account, defaultProjectId, historyDepth, hydrateForm, isSaving, selectionMode, showError]);

  const handleDisconnect = useCallback(() => {
    if (account == null || isSaving) return;
    setIsSaving(true);
    void disconnectZulipExternalAccount(account.uuid)
      .then((result) => {
        if (!result.ok) {
          showError(mapMutationError(result.kind));
          return;
        }
        setAccount(result.value);
        setSuccess(t("settings.externalAccountDisconnected"));
      })
      .catch(() => showError(t("settings.externalAccountSaveError")))
      .finally(() => setIsSaving(false));
  }, [account, isSaving, showError]);

  const handleDelete = useCallback(() => {
    if (account == null || isSaving) return;
    setIsSaving(true);
    void deleteZulipExternalAccount(account.uuid)
      .then((result) => {
        if (!result.ok) {
          showError(mapMutationError(result.kind));
          return;
        }
        setAccount(null);
        setChats([]);
        setOperations([]);
        hydrateForm(null);
        setDeleteConfirmation(false);
        setFormMode(null);
        setSuccess(t("settings.externalAccountDeleted"));
      })
      .catch(() => showError(t("settings.externalAccountSaveError")))
      .finally(() => setIsSaving(false));
  }, [account, hydrateForm, isSaving, showError]);

  const unavailableReasons = useMemo(
    () => (account == null ? [] : capabilityReason(account)),
    [account],
  );
  const chatCatalogAvailable =
    account != null &&
    isExternalCapabilityAvailable(account.capabilities, EXTERNAL_CAPABILITY.chatCatalog);
  const cardClassName = compact
    ? "rounded-lg border border-border-subtle bg-bg-elevated p-3"
    : "rounded-xl border border-border-subtle bg-card-bg p-4";

  return (
    <section className={cardClassName} data-testid="zulip-external-account-card">
      <header className="flex items-start gap-3 border-b border-border-subtle pb-3">
        <Icon name="links" size={20} className="mt-0.5 shrink-0 text-icon-base" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">
              {t("settings.externalMessengerAccounts")}
            </h2>
            <details className="relative" data-testid="zulip-provider-popover">
              <summary
                className="border-accent/35 bg-accent/10 cursor-pointer list-none rounded-sm border px-1.5 py-0.5 text-xs font-semibold text-text-secondary"
                data-testid="zulip-provider-badge"
              >
                {t("settings.zulipProviderName")}
              </summary>
              <div className="absolute left-0 top-full z-20 mt-1 min-w-56 rounded-lg border border-border-subtle bg-card-bg p-3 text-xs text-text-secondary shadow-lg">
                <p className="font-semibold text-text-primary">{t("settings.zulipProviderName")}</p>
                {account != null && (
                  <>
                    <p className="mt-1 break-all">{account.settings.serverUrl}</p>
                    <p className="break-all">{account.settings.email}</p>
                  </>
                )}
              </div>
            </details>
          </div>
          <p className="mt-1 text-xs text-text-secondary" data-testid="zulip-account-status">
            {account == null
              ? t("settings.externalAccountNotConnected")
              : t(`settings.externalAccountStatus.${account.status}`)}
          </p>
          {account != null && !account.liveReady && account.status !== "disconnected" && (
            <p
              className="mt-1 text-xs text-accent"
              role="status"
              data-testid="zulip-notification-gate"
            >
              {t("settings.externalAccountInitialSyncNotificationsPaused")}
            </p>
          )}
          {account?.safeError != null && (
            <p className="mt-1 text-xs text-notice-base">{account.safeError}</p>
          )}
        </div>
      </header>

      {(formMode === "connect" || formMode === "reconnect") && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="zulip-credential-form">
          <label className="block min-w-0">
            <SectionLabel className="mb-1">{t("settings.zulipServerUrl")}</SectionLabel>
            <input
              type="url"
              value={serverUrl}
              onChange={(event) => {
                formDirtyRef.current = true;
                setServerUrl(event.target.value);
              }}
              disabled={isSaving}
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
              placeholder={t("settings.zulipServerUrlPlaceholder")}
              aria-label={t("settings.zulipServerUrl")}
              data-testid="zulip-server-url"
            />
          </label>
          <label className="block min-w-0">
            <SectionLabel className="mb-1">{t("settings.zulipEmail")}</SectionLabel>
            <input
              type="email"
              value={email}
              onChange={(event) => {
                formDirtyRef.current = true;
                setEmail(event.target.value);
              }}
              disabled={isSaving}
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
              aria-label={t("settings.zulipEmail")}
              data-testid="zulip-email"
            />
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <SectionLabel className="mb-1">{t("settings.zulipApiKey")}</SectionLabel>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => {
                formDirtyRef.current = true;
                setApiKey(event.target.value);
              }}
              disabled={isSaving}
              autoComplete="off"
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
              aria-label={t("settings.zulipApiKey")}
              data-testid="zulip-api-key"
            />
          </label>
        </div>
      )}

      {!compact && (formMode === "connect" || formMode === "settings") && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="zulip-sync-settings">
          <label className="block min-w-0">
            <SectionLabel className="mb-1">{t("settings.externalSelectionMode")}</SectionLabel>
            <select
              value={selectionMode}
              onChange={(event) => {
                formDirtyRef.current = true;
                setSelectionMode(event.target.value as ExternalSelectionMode);
              }}
              disabled={isSaving}
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary"
              aria-label={t("settings.externalSelectionMode")}
              data-testid="zulip-selection-mode"
            >
              <option value="explicit">{t("settings.externalSelectionExplicit")}</option>
              <option value="all">{t("settings.externalSelectionAll")}</option>
            </select>
          </label>
          <label className="block min-w-0">
            <SectionLabel className="mb-1">{t("settings.externalHistoryDepth")}</SectionLabel>
            <select
              value={historyDepth}
              onChange={(event) => {
                formDirtyRef.current = true;
                setHistoryDepth(event.target.value as ExternalHistoryDepth);
              }}
              disabled={isSaving}
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary"
              aria-label={t("settings.externalHistoryDepth")}
              data-testid="zulip-history-depth"
            >
              {HISTORY_DEPTHS.map((depth) => (
                <option key={depth} value={depth}>
                  {t(`settings.externalHistoryDepthOption.${depth}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <SectionLabel className="mb-1">{t("settings.externalDefaultProject")}</SectionLabel>
            <input
              type="text"
              value={defaultProjectId}
              onChange={(event) => {
                formDirtyRef.current = true;
                setDefaultProjectId(event.target.value);
              }}
              disabled={isSaving}
              className="w-full rounded-md border border-border-subtle bg-bg px-2 py-2 text-sm text-text-primary"
              aria-label={t("settings.externalDefaultProject")}
              data-testid="zulip-default-project"
            />
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {account == null && formMode == null && (
          <button
            type="button"
            className="min-h-11 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent"
            onClick={() => openForm("connect")}
            disabled={isLoading}
            data-testid="zulip-connect-open"
          >
            {t("settings.externalAccountAdd")}
          </button>
        )}
        {formMode === "connect" && (
          <button
            type="button"
            className="min-h-11 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-50"
            onClick={handleConnectOrReconnect}
            disabled={isSaving}
            data-testid="zulip-connect-submit"
          >
            {isSaving ? t("settings.externalAccountSaving") : t("settings.externalAccountConnect")}
          </button>
        )}
        {account != null && formMode == null && (
          <>
            {!compact && (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary"
                onClick={() => openForm("settings")}
                data-testid="zulip-settings-open"
              >
                {t("settings.externalAccountSettings")}
              </button>
            )}
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary"
              onClick={() => openForm("reconnect")}
              data-testid="zulip-reconnect-open"
            >
              {t("settings.externalAccountReconnect")}
            </button>
            {account.status !== "disconnected" && (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary"
                onClick={handleDisconnect}
                disabled={isSaving}
                data-testid="zulip-disconnect"
              >
                {t("settings.externalAccountDisconnect")}
              </button>
            )}
            <button
              type="button"
              className="border-notice-base/40 min-h-11 rounded-lg border px-3 text-sm text-notice-base"
              onClick={() => setDeleteConfirmation(true)}
              data-testid="zulip-delete-open"
            >
              {t("settings.externalAccountDelete")}
            </button>
          </>
        )}
        {formMode === "settings" && (
          <button
            type="button"
            className="min-h-11 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-50"
            onClick={handleUpdateSettings}
            disabled={isSaving || account?.etag == null}
            data-testid="zulip-settings-save"
          >
            {t("settings.externalAccountSettingsSave")}
          </button>
        )}
        {formMode === "reconnect" && (
          <button
            type="button"
            className="min-h-11 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-50"
            onClick={handleConnectOrReconnect}
            disabled={isSaving}
            data-testid="zulip-reconnect-submit"
          >
            {t("settings.externalAccountReconnect")}
          </button>
        )}
        {formMode != null && (
          <button
            type="button"
            className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-secondary"
            onClick={() => {
              hydrateForm(account);
              setFormMode(null);
            }}
          >
            {t("common.cancel")}
          </button>
        )}
      </div>

      {deleteConfirmation && account != null && (
        <AccessibleAlertDialog
          className="border-notice-base/40 bg-notice-base/10 mt-3 rounded-lg border p-3"
          label={t("settings.externalAccountDeleteConfirmTitle")}
          onDismiss={() => setDeleteConfirmation(false)}
          data-testid="zulip-delete-confirmation"
        >
          <p className="text-sm text-text-primary">
            {t("settings.externalAccountDeleteConfirmDescription")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg bg-notice-base px-3 text-sm text-on-accent"
              onClick={handleDelete}
              disabled={isSaving}
              data-testid="zulip-delete-confirm"
            >
              {t("settings.externalAccountDeleteConfirm")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-secondary"
              onClick={() => setDeleteConfirmation(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </AccessibleAlertDialog>
      )}

      {!compact && account != null && unavailableReasons.length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="zulip-unavailable-capabilities">
          {unavailableReasons.map((reason) => (
            <li key={reason} className="text-xs text-notice-base">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {!compact && account != null && selectionMode === "explicit" && !chatCatalogAvailable && (
        <p
          className="mt-5 text-sm text-text-secondary"
          data-testid="zulip-chat-catalog-unavailable"
        >
          {t("settings.externalChatsUnavailable")}
        </p>
      )}

      {!compact && account != null && selectionMode === "explicit" && chatCatalogAvailable && (
        <div className="mt-5" data-testid="zulip-chat-catalog">
          <h3 className="text-sm font-semibold text-text-primary">{t("settings.externalChats")}</h3>
          {chats.length === 0 ? (
            <p className="mt-2 text-sm text-text-secondary">{t("settings.externalChatsEmpty")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {chats.map((chat) => (
                <ExternalChatRow
                  key={chat.uuid}
                  chat={chat}
                  projectId={defaultProjectId}
                  disabled={isSaving}
                  onChanged={replaceChat}
                  onError={showError}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {!compact && account != null && operations.length > 0 && (
        <div className="mt-5" data-testid="zulip-external-operations">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("settings.externalOperations")}
          </h3>
          <ul className="mt-2 space-y-2">
            {operations.map((operation) => (
              <ExternalOperationRow
                key={operation.uuid}
                operation={operation}
                onChanged={replaceOperation}
                onDiscarded={removeOperation}
                onError={showError}
              />
            ))}
          </ul>
        </div>
      )}

      {isLoading && (
        <p className="mt-3 text-sm text-text-muted">{t("settings.externalAccountLoading")}</p>
      )}
      {success != null && <p className="mt-3 text-sm text-accent">{success}</p>}
      {error != null && (
        <p className="mt-3 text-sm text-notice-base" role="alert">
          {error}
        </p>
      )}
    </section>
  );
};
