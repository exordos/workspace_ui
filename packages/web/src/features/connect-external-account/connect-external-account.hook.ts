import { useCallback, useEffect, useState } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createExternalAccount } from "~/shared/api/messenger-external-accounts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { normalizeServerBaseUrl } from "~/shared/lib/server-url.lib";
import { isValidEmail, isValidRealmUrl } from "~/shared/lib/validation";
import type {
  ConnectExternalAccountDraft,
  ConnectExternalAccountProvider,
} from "./connect-external-account.types";

const EMPTY_DRAFT: ConnectExternalAccountDraft = {
  provider: "zulip",
  serverUrl: "",
  email: "",
  apiKey: "",
};

export interface UseConnectExternalAccountOptions {
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext | null;
  onCompleted?: () => void;
}

export interface UseConnectExternalAccountResult {
  draft: ConnectExternalAccountDraft;
  accounts: ExternalAccount[];
  submitting: boolean;
  loadingAccounts: boolean;
  error: string | null;
  duplicateZulip: boolean;
  setProvider: (provider: ConnectExternalAccountProvider) => void;
  setServerUrl: (value: string) => void;
  setEmail: (value: string) => void;
  setApiKey: (value: string) => void;
  submit: () => void;
}

export function useConnectExternalAccount({
  open,
  runtimeContext,
  onCompleted,
}: UseConnectExternalAccountOptions): UseConnectExternalAccountResult {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedAccounts = useExternalAccountStore((state) => state.accounts);
  const accountOwnerKey = useExternalAccountStore((state) => state.ownerKey);
  const accountLoadStatus = useExternalAccountStore((state) => state.loadStatus);
  const runtimeOwnerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const accounts = accountOwnerKey === runtimeOwnerKey ? storedAccounts : [];
  const loadingAccounts =
    runtimeOwnerKey != null &&
    (accountOwnerKey !== runtimeOwnerKey || accountLoadStatus === "loading");
  const duplicateZulip = accounts.some((account) => account.accountType === "zulip");

  useEffect(() => {
    if (!open || runtimeContext == null) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setDraft(EMPTY_DRAFT);
      setError(null);
      void refreshExternalAccounts({ runtimeContext, signal: controller.signal }).catch(
        () => undefined,
      );
    });
    return () => controller.abort();
  }, [open, runtimeContext]);

  const setProvider = useCallback((provider: ConnectExternalAccountProvider) => {
    setDraft((current) => ({ ...current, provider }));
    setError(null);
  }, []);
  const setServerUrl = useCallback((serverUrl: string) => {
    setDraft((current) => ({ ...current, serverUrl }));
    setError(null);
  }, []);
  const setEmail = useCallback((email: string) => {
    setDraft((current) => ({ ...current, email }));
    setError(null);
  }, []);
  const setApiKey = useCallback((apiKey: string) => {
    setDraft((current) => ({ ...current, apiKey }));
    setError(null);
  }, []);

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
    if (!isValidEmail(email)) {
      setError("invalid-email");
      return;
    }
    if (duplicateZulip) {
      setError("duplicate");
      return;
    }

    setSubmitting(true);
    setError(null);
    void createExternalAccount(buildMessengerRequestOptions(runtimeContext), {
      uuid: globalThis.crypto.randomUUID(),
      settings: {
        kind: "zulip",
        server_url: serverUrl,
        email,
        api_key: apiKey,
        selection_mode: "explicit",
        history_depth: "30_days",
        default_project_id: runtimeContext.projectId,
      },
    })
      .then(async () => {
        await refreshExternalAccounts({ runtimeContext });
        setDraft(EMPTY_DRAFT);
        onCompleted?.();
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof MessengerApiError && requestError.status === 409) {
          setError("duplicate");
          return;
        }
        if (
          requestError instanceof MessengerApiError &&
          (requestError.status === 400 || requestError.status === 401)
        ) {
          setError("invalid");
          return;
        }
        if (
          requestError instanceof MessengerApiError &&
          (requestError.status === 502 || requestError.status === 503)
        ) {
          setError("unavailable");
          return;
        }
        setError("connect");
      })
      .finally(() => setSubmitting(false));
  }, [
    draft.apiKey,
    draft.email,
    draft.serverUrl,
    duplicateZulip,
    onCompleted,
    runtimeContext,
    submitting,
  ]);

  return {
    draft,
    accounts,
    submitting,
    loadingAccounts: runtimeContext == null ? false : loadingAccounts,
    error,
    duplicateZulip,
    setProvider,
    setServerUrl,
    setEmail,
    setApiKey,
    submit,
  };
}
