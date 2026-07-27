import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adaptWorkspaceExternalAccountDto,
  isExternalAccountDuplicate,
} from "~/entities/external-account/external-account-adapters.lib";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createExternalAccount,
  getExternalAccount,
  reconnectExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { normalizeServerBaseUrl } from "~/shared/lib/server-url.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import type {
  ConnectExternalAccountDraft,
  ConnectExternalAccountError,
  ConnectExternalAccountProvider,
} from "./connect-external-account.types";

const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 20;
// Temporarily unblock chat sync work while backend readiness is being stabilized.
const TEMPORARILY_COMPLETE_AFTER_ACCEPTED_ACCOUNT_RESPONSE = true;

function emptyDraft(account?: ExternalAccount | null): ConnectExternalAccountDraft {
  return {
    provider: "zulip",
    serverUrl: account?.settings.serverUrl ?? "",
    email: account?.settings.email ?? "",
    apiKey: "",
  };
}

function isTerminal(account: ExternalAccount): boolean {
  return (
    account.liveReady ||
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

export interface UseConnectExternalAccountOptions {
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext | null;
  reconnectAccount?: ExternalAccount | null;
  onCompleted?: () => void;
}

export interface UseConnectExternalAccountResult {
  draft: ConnectExternalAccountDraft;
  accounts: ExternalAccount[];
  lifecycleAccount: ExternalAccount | null;
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
  onCompleted,
}: UseConnectExternalAccountOptions): UseConnectExternalAccountResult {
  const [draft, setDraft] = useState(() => emptyDraft(reconnectAccount));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ConnectExternalAccountError | null>(null);
  const [lifecycleAccount, setLifecycleAccount] = useState<ExternalAccount | null>(null);
  const [reconnectTarget, setReconnectTarget] = useState<ExternalAccount | null>(reconnectAccount);
  const [pollAccountUuid, setPollAccountUuid] = useState<string | null>(null);
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
  const visibleAccounts = accountOwnerKey === runtimeOwnerKey ? accounts : [];
  const reconnecting = reconnectTarget != null;
  const duplicateZulip = useMemo(
    () => !reconnecting && isExternalAccountDuplicate(visibleAccounts, "zulip"),
    [reconnecting, visibleAccounts],
  );

  useEffect(() => {
    if (!open) {
      requestControllerRef.current?.abort();
      setDraft(emptyDraft());
      setLifecycleAccount(null);
      setReconnectTarget(null);
      setPollAccountUuid(null);
      attemptUuidRef.current = null;
      completionReportedRef.current = false;
      return;
    }
    setDraft(emptyDraft(reconnectAccount));
    setError(null);
    setLifecycleAccount(reconnectAccount);
    setReconnectTarget(reconnectAccount);
    setPollAccountUuid(null);
    attemptUuidRef.current = null;
    completionReportedRef.current = false;
    if (runtimeContext != null) {
      void refreshExternalAccounts({ runtimeContext }).catch(() => undefined);
    }
  }, [open, reconnectAccount, runtimeContext]);

  useEffect(() => {
    if (lifecycleAccount == null) return;
    const updated = visibleAccounts.find((account) => account.uuid === lifecycleAccount.uuid);
    if (updated != null && updated.revision >= lifecycleAccount.revision) {
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
    if (!open || runtimeContext == null || pollAccountUuid == null) return;
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const controller = new AbortController();
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      attempts += 1;
      try {
        const snapshot = await getExternalAccount(
          buildMessengerRequestOptions(runtimeContext, undefined, controller.signal),
          pollAccountUuid,
        );
        const currentRuntime = runtimeRef.current;
        if (
          controller.signal.aborted ||
          currentRuntime == null ||
          workspaceRuntimeOwnerKey(currentRuntime) !== ownerKey
        ) {
          return;
        }
        const account = adaptWorkspaceExternalAccountDto(snapshot.account, snapshot.etag);
        setLifecycleAccount(account);
        if (account.status === "auth_required" || account.status === "degraded") {
          setReconnectTarget(account);
        }
        if (isTerminal(account) || attempts >= MAX_POLL_ATTEMPTS) {
          setPollAccountUuid(null);
          void refreshExternalAccounts({ runtimeContext, signal: controller.signal }).catch(
            () => undefined,
          );
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          setPollAccountUuid(null);
          return;
        }
      }
      timeoutId = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      controller.abort();
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [open, pollAccountUuid, runtimeContext]);

  useEffect(() => {
    if (lifecycleAccount?.liveReady !== true) return;
    setDraft((current) => ({ ...current, apiKey: "" }));
    reportCompleted();
  }, [lifecycleAccount?.liveReady, reportCompleted]);

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
    if (runtimeContext == null || submitting) return;
    const serverUrl = normalizeServerBaseUrl(draft.serverUrl);
    const email = draft.email.trim();
    const apiKey = draft.apiKey.trim();
    if (serverUrl.length === 0 || email.length === 0 || apiKey.length === 0) {
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

    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    setSubmitting(true);
    setError(null);
    const options = buildMessengerRequestOptions(runtimeContext, undefined, controller.signal);
    const request = reconnectTarget
      ? reconnectExternalAccount(
          options,
          reconnectTarget.uuid,
          { settings: { kind: "zulip", server_url: serverUrl, email, api_key: apiKey } },
          reconnectTarget.etag,
        )
      : createExternalAccount(options, {
          uuid: (attemptUuidRef.current ??= crypto.randomUUID()),
          settings: {
            kind: "zulip",
            server_url: serverUrl,
            email,
            api_key: apiKey,
            selection_mode: "explicit",
            history_depth: "30_days",
            default_project_id: runtimeContext.projectId,
          },
        });

    void request
      .then((snapshot) => {
        const currentRuntime = runtimeRef.current;
        if (
          controller.signal.aborted ||
          currentRuntime == null ||
          workspaceRuntimeOwnerKey(currentRuntime) !== ownerKey
        ) {
          return;
        }
        const account = adaptWorkspaceExternalAccountDto(snapshot.account, snapshot.etag);
        setDraft((current) => ({ ...current, apiKey: "" }));
        setLifecycleAccount(account);
        if (account.status === "auth_required" || account.status === "degraded") {
          setReconnectTarget(account);
        }
        if (TEMPORARILY_COMPLETE_AFTER_ACCEPTED_ACCOUNT_RESPONSE) {
          setPollAccountUuid(null);
          reportCompleted();
        } else if (!isTerminal(account)) {
          setPollAccountUuid(account.uuid);
        }
        void refreshExternalAccounts({ runtimeContext }).catch(() => undefined);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(mapRequestError(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSubmitting(false);
      });
  }, [draft, duplicateZulip, reconnectTarget, reportCompleted, runtimeContext, submitting]);

  const resetCredentials = useCallback(() => {
    setLifecycleAccount(null);
    setPollAccountUuid(null);
    setDraft(emptyDraft(reconnectTarget));
    setError(null);
    attemptUuidRef.current = null;
  }, [reconnectTarget]);

  return {
    draft,
    accounts: visibleAccounts,
    lifecycleAccount,
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
