import { useCallback, useEffect, useMemo, useState } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createExternalAccount } from "~/shared/api/messenger-external-accounts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { normalizeServerBaseUrl } from "~/shared/lib/server-url.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import type {
  ConnectExternalAccountDraft,
  ConnectExternalAccountProvider,
} from "./connect-external-account.types";

const EMPTY_DRAFT: ConnectExternalAccountDraft = {
  provider: "zulip",
  serverUrl: "",
  login: "",
  token: "",
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
  setLogin: (value: string) => void;
  setToken: (value: string) => void;
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
  const accounts = useExternalAccountStore((state) => state.accounts);
  const loadingAccounts = useExternalAccountStore((state) => state.loadStatus === "loading");
  const duplicateZulip = useMemo(
    () => accounts.some((account) => account.accountType === "zulip"),
    [accounts],
  );

  useEffect(() => {
    if (!open || runtimeContext == null) return;
    setDraft(EMPTY_DRAFT);
    setError(null);
    void refreshExternalAccounts({ runtimeContext }).catch(() => undefined);
  }, [open, runtimeContext]);

  const setProvider = useCallback((provider: ConnectExternalAccountProvider) => {
    setDraft((current) => ({ ...current, provider }));
  }, []);
  const setServerUrl = useCallback((serverUrl: string) => {
    setDraft((current) => ({ ...current, serverUrl }));
  }, []);
  const setLogin = useCallback((login: string) => {
    setDraft((current) => ({ ...current, login }));
  }, []);
  const setToken = useCallback((token: string) => {
    setDraft((current) => ({ ...current, token }));
  }, []);

  const submit = useCallback(() => {
    if (runtimeContext == null || submitting) return;
    const serverUrl = normalizeServerBaseUrl(draft.serverUrl);
    const login = draft.login.trim();
    const token = draft.token.trim();
    if (serverUrl.length === 0 || login.length === 0 || token.length === 0) {
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

    setSubmitting(true);
    setError(null);
    void createExternalAccount(buildMessengerRequestOptions(runtimeContext), {
      server_url: serverUrl,
      account_settings: {
        kind: "zulip",
        credentials: { kind: "zulip", login, token },
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
    draft.login,
    draft.serverUrl,
    draft.token,
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
    setLogin,
    setToken,
    submit,
  };
}
