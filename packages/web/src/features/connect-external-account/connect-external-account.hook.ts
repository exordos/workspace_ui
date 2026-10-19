import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adaptWorkspaceExternalAccountDto,
  isExternalAccountDuplicate,
  toWorkspaceExternalAccountCacheProfile,
} from "~/entities/external-account/external-account-adapters.lib";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import {
  isExternalAccountSnapshotOlder,
  useExternalAccountStore,
} from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createExternalAccount,
  getExternalAccount,
  reconnectExternalAccount,
  updateExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { normalizeServerBaseUrl } from "~/shared/lib/server-url.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import { replaceWorkspaceExternalAccountCache } from "~/shared/lib/workspace-external-account-cache-db";
import type {
  ConnectExternalAccountDraft,
  ConnectExternalAccountError,
  ConnectExternalAccountProvider,
} from "./connect-external-account.types";

export type ConnectExternalAccountPhase = "credentials" | "checking" | "automaticDone";

function emptyDraft(account?: ExternalAccount | null): ConnectExternalAccountDraft {
  return {
    provider: "zulip",
    serverUrl: account?.settings.serverUrl ?? "",
    email: account?.settings.email ?? "",
    apiKey: "",
  };
}

function isBridgeConfirmed(account: ExternalAccount): boolean {
  return (
    account.status === "live" &&
    account.liveReady === true &&
    account.appliedGeneration === account.desiredGeneration
  );
}

function needsAttention(account: ExternalAccount): boolean {
  return (
    account.status === "auth_required" ||
    account.status === "degraded" ||
    account.status === "disconnected" ||
    account.status === "suspended"
  );
}

function isExternalResourceForbiddenError(error: MessengerApiError): boolean {
  if (error.status !== 403 || typeof error.data !== "object" || error.data == null) {
    return false;
  }
  return "type" in error.data && error.data.type === "ExternalResourceForbiddenError";
}

function mapRequestError(error: unknown): ConnectExternalAccountError {
  if (!(error instanceof MessengerApiError)) return "connect";
  if (isExternalResourceForbiddenError(error)) return "forbidden";
  if (error.status === 409 || error.status === 412) return "conflict";
  if (error.status === 400 || error.status === 401) return "invalid";
  if (error.status === 502 || error.status === 503) return "unavailable";
  return "connect";
}

function currentAttemptUuid(ref: { current: string | null }): string {
  ref.current ??= crypto.randomUUID();
  return ref.current;
}

export interface UseConnectExternalAccountOptions {
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext | null;
  reconnectAccount?: ExternalAccount | null;
  editAccount?: ExternalAccount | null;
  onCompleted?: () => void;
}

export interface UseConnectExternalAccountResult {
  draft: ConnectExternalAccountDraft;
  accounts: ExternalAccount[];
  lifecycleAccount: ExternalAccount | null;
  phase: ConnectExternalAccountPhase;
  submitting: boolean;
  loadingAccounts: boolean;
  error: ConnectExternalAccountError | null;
  duplicateZulip: boolean;
  reconnecting: boolean;
  setProvider: (provider: ConnectExternalAccountProvider) => void;
  setServerUrl: (value: string) => void;
  setEmail: (value: string) => void;
  setApiKey: (value: string) => void;
  submit: () => void;
  resetCredentials: () => void;
}

export function useConnectExternalAccount({
  open,
  runtimeContext,
  reconnectAccount = null,
  editAccount = null,
  onCompleted,
}: UseConnectExternalAccountOptions): UseConnectExternalAccountResult {
  const [draft, setDraft] = useState(() => emptyDraft(editAccount ?? reconnectAccount));
  const [phase, setPhase] = useState<ConnectExternalAccountPhase>("credentials");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ConnectExternalAccountError | null>(null);
  const [lifecycleAccount, setLifecycleAccount] = useState<ExternalAccount | null>(null);
  const [reconnectTarget, setReconnectTarget] = useState<ExternalAccount | null>(reconnectAccount);
  const attemptUuidRef = useRef<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const completionReportedRef = useRef(false);
  const runtimeRef = useRef(runtimeContext);

  useEffect(() => {
    runtimeRef.current = runtimeContext;
  }, [runtimeContext]);

  const accounts = useExternalAccountStore((state) => state.accounts);
  const accountOwnerKey = useExternalAccountStore((state) => state.ownerKey);
  const loadingAccounts = useExternalAccountStore((state) => state.loadStatus === "loading");
  const runtimeOwnerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const visibleAccounts = useMemo(
    () => (accountOwnerKey === runtimeOwnerKey ? accounts : []),
    [accountOwnerKey, accounts, runtimeOwnerKey],
  );
  const reconnecting = reconnectTarget != null;
  const duplicateZulip = useMemo(
    () =>
      editAccount == null && !reconnecting && isExternalAccountDuplicate(visibleAccounts, "zulip"),
    [editAccount, reconnecting, visibleAccounts],
  );

  useEffect(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setSubmitting(false);
    if (!open) {
      setDraft(emptyDraft());
      setPhase("credentials");
      setError(null);
      setLifecycleAccount(null);
      setReconnectTarget(null);
      attemptUuidRef.current = null;
      completionReportedRef.current = false;
      return;
    }
    const controller = new AbortController();
    setDraft(emptyDraft(editAccount ?? reconnectAccount));
    setPhase("credentials");
    setError(null);
    setLifecycleAccount(reconnectAccount);
    setReconnectTarget(reconnectAccount);
    attemptUuidRef.current = null;
    completionReportedRef.current = false;
    if (runtimeContext != null) {
      void refreshExternalAccounts({ runtimeContext, signal: controller.signal }).catch(
        () => undefined,
      );
    }
    return () => {
      controller.abort();
      requestControllerRef.current?.abort();
    };
  }, [editAccount, open, reconnectAccount, runtimeContext]);

  useEffect(() => {
    if (lifecycleAccount == null) return;
    const updated = visibleAccounts.find((account) => account.uuid === lifecycleAccount.uuid);
    if (updated != null && !isExternalAccountSnapshotOlder(updated, lifecycleAccount)) {
      setLifecycleAccount(updated);
      if (reconnectTarget?.uuid === updated.uuid) setReconnectTarget(updated);
    }
  }, [lifecycleAccount, reconnectTarget?.uuid, visibleAccounts]);

  const reportCompleted = useCallback(() => {
    if (completionReportedRef.current) return;
    completionReportedRef.current = true;
    onCompleted?.();
  }, [onCompleted]);

  useEffect(() => {
    if (lifecycleAccount == null || !needsAttention(lifecycleAccount)) return;
    if (lifecycleAccount.status === "auth_required" || lifecycleAccount.status === "degraded") {
      setReconnectTarget(lifecycleAccount);
    }
    if (phase === "automaticDone") {
      setPhase("checking");
    }
  }, [lifecycleAccount, phase]);

  useEffect(() => {
    if (lifecycleAccount == null || !isBridgeConfirmed(lifecycleAccount)) return;
    setDraft((current) => ({ ...current, apiKey: "" }));
    if (reconnecting) {
      reportCompleted();
      return;
    }
    setPhase("automaticDone");
  }, [lifecycleAccount, reconnecting, reportCompleted]);

  const changeDraft = useCallback(
    (patch: Partial<ConnectExternalAccountDraft>, startsNewAttempt = true) => {
      if (startsNewAttempt) attemptUuidRef.current = null;
      setDraft((current) => ({ ...current, ...patch }));
      setError(null);
    },
    [],
  );
  const setProvider = useCallback(
    (provider: ConnectExternalAccountProvider) => changeDraft({ provider }),
    [changeDraft],
  );
  const setServerUrl = useCallback(
    (serverUrl: string) => changeDraft({ serverUrl }),
    [changeDraft],
  );
  const setEmail = useCallback((email: string) => changeDraft({ email }), [changeDraft]);
  const setApiKey = useCallback((apiKey: string) => changeDraft({ apiKey }), [changeDraft]);

  const submit = useCallback(() => {
    if (!open || runtimeContext == null || submitting || requestControllerRef.current != null)
      return;
    const serverUrl = normalizeServerBaseUrl(draft.serverUrl);
    const email = draft.email.trim();
    const apiKey = draft.apiKey.trim();
    if (
      serverUrl.length === 0 ||
      email.length === 0 ||
      (editAccount == null && apiKey.length === 0)
    ) {
      setError("fill");
      return;
    }
    if (!isValidRealmUrl(serverUrl)) {
      setError("invalid-url");
      return;
    }
    if (duplicateZulip) {
      setError("duplicate");
      return;
    }

    const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
    if (requestContext == null) return;
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setSubmitting(true);
    setPhase("checking");
    setError(null);
    const options = buildMessengerRequestOptions(runtimeContext, undefined, controller.signal);
    const isInvalidated = () =>
      isWorkspaceRuntimeRequestInvalidated(
        requestContext,
        () => runtimeRef.current,
        controller.signal,
      );
    const request = (async () => {
      if (editAccount != null) {
        const latest = await getExternalAccount(options, editAccount.uuid);
        if (isInvalidated()) throw new DOMException("Request aborted", "AbortError");
        // PUT replaces settings, so retain credentials and provider options only in this request.
        return updateExternalAccount(
          options,
          editAccount.uuid,
          {
            settings: {
              ...latest.account.settings,
              ...(serverUrl !== normalizeServerBaseUrl(editAccount.settings.serverUrl)
                ? { server_url: serverUrl }
                : {}),
              ...(email !== editAccount.settings.email.trim() ? { email } : {}),
              ...(apiKey.length > 0 ? { api_key: apiKey } : {}),
            },
          },
          latest.etag,
        );
      }
      if (reconnectTarget != null) {
        return reconnectExternalAccount(
          options,
          reconnectTarget.uuid,
          {
            settings: { kind: "zulip", server_url: serverUrl, email, api_key: apiKey },
          },
          reconnectTarget.etag,
        );
      }
      return createExternalAccount(options, {
        uuid: currentAttemptUuid(attemptUuidRef),
        provider: "zulip",
        settings: {
          kind: "zulip",
          server_url: serverUrl,
          email,
          api_key: apiKey,
          selection_mode: "all",
          history_depth: "all",
          default_project_id: runtimeContext.projectId,
        },
      });
    })();

    void request
      .then(async (snapshot) => {
        if (isInvalidated()) return;
        const account = adaptWorkspaceExternalAccountDto(snapshot.account, snapshot.etag);
        const store = useExternalAccountStore.getState();
        store.upsertAccountForOwner(ownerKey, account);
        const latestStore = useExternalAccountStore.getState();
        const currentAccount =
          latestStore.ownerKey === ownerKey
            ? latestStore.accounts.find((item) => item.uuid === account.uuid)
            : undefined;
        const effectiveAccount =
          currentAccount != null && isExternalAccountSnapshotOlder(account, currentAccount)
            ? currentAccount
            : account;
        setDraft((current) => ({ ...current, apiKey: "" }));
        setLifecycleAccount(effectiveAccount);
        if (editAccount != null) {
          await replaceWorkspaceExternalAccountCache(
            ownerKey,
            latestStore.accounts.map(toWorkspaceExternalAccountCacheProfile),
            () =>
              !isInvalidated() &&
              useExternalAccountStore.getState().ownerKey === ownerKey &&
              useExternalAccountStore.getState().loadGeneration === latestStore.loadGeneration,
          );
          if (!isInvalidated()) {
            reportCompleted();
          }
          return;
        }
        if (reconnectTarget == null) {
          reportCompleted();
          return;
        }
        if (effectiveAccount.status === "auth_required" || effectiveAccount.status === "degraded") {
          setReconnectTarget(effectiveAccount);
        }
      })
      .catch((requestError: unknown) => {
        if (!isInvalidated()) {
          const mappedError = mapRequestError(requestError);
          setPhase("credentials");
          setError(mappedError);
          if (mappedError === "conflict") {
            void refreshExternalAccounts({ runtimeContext, signal: controller.signal }).catch(
              () => undefined,
            );
          }
        }
      })
      .finally(() => {
        if (!isInvalidated()) {
          setSubmitting(false);
          if (requestControllerRef.current === controller) {
            requestControllerRef.current = null;
          }
        }
      });
  }, [
    draft,
    duplicateZulip,
    editAccount,
    open,
    reconnectTarget,
    reportCompleted,
    runtimeContext,
    submitting,
  ]);

  const resetCredentials = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setSubmitting(false);
    setLifecycleAccount(null);
    setPhase("credentials");
    setDraft(emptyDraft(reconnectTarget));
    setError(null);
    attemptUuidRef.current = null;
  }, [reconnectTarget]);

  return {
    draft,
    accounts: visibleAccounts,
    lifecycleAccount,
    phase,
    submitting,
    loadingAccounts: runtimeContext == null ? false : loadingAccounts,
    error,
    duplicateZulip,
    reconnecting,
    setProvider,
    setServerUrl,
    setEmail,
    setApiKey,
    submit,
    resetCredentials,
  };
}
