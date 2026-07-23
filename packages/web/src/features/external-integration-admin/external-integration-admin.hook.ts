import { useCallback, useEffect, useState } from "react";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  changeExternalProviderSuspension,
  getExternalProviderHealth,
  getExternalProviderPolicy,
  updateExternalProviderPolicy,
} from "~/shared/api/messenger-external-accounts.api";
import type {
  WorkspaceExternalProviderHealthDto,
  WorkspaceExternalProviderPolicyDto,
} from "~/shared/api/messenger-external-accounts.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";

const MEBIBYTE = 1024 * 1024;

export interface ExternalIntegrationAdminDraft {
  enabled: boolean;
  maxAccounts: number;
  maxSelectedChatsPerAccount: number;
  maxFileMib: number;
}

export type ExternalIntegrationAdminStatus = "loading" | "ready" | "denied" | "error";
export type ExternalIntegrationAdminError = "load" | "save" | "conflict" | "action" | "invalid";

export interface ExternalIntegrationAdminViewModel {
  status: ExternalIntegrationAdminStatus;
  policy: WorkspaceExternalProviderPolicyDto | null;
  health: WorkspaceExternalProviderHealthDto | null;
  draft: ExternalIntegrationAdminDraft | null;
  saving: boolean;
  changingSuspension: boolean;
  saved: boolean;
  error: ExternalIntegrationAdminError | null;
  updateDraft: (values: Partial<ExternalIntegrationAdminDraft>) => void;
  save: () => void;
  changeSuspension: () => void;
  reload: () => void;
}

function policyDraft(policy: WorkspaceExternalProviderPolicyDto): ExternalIntegrationAdminDraft {
  return {
    enabled: policy.enabled,
    maxAccounts: policy.limits.max_accounts,
    maxSelectedChatsPerAccount: policy.limits.max_selected_chats_per_account,
    maxFileMib: policy.limits.max_file_bytes / MEBIBYTE,
  };
}

function validDraft(draft: ExternalIntegrationAdminDraft): boolean {
  return (
    Number.isInteger(draft.maxAccounts) &&
    draft.maxAccounts >= 0 &&
    draft.maxAccounts <= 100000 &&
    Number.isInteger(draft.maxSelectedChatsPerAccount) &&
    draft.maxSelectedChatsPerAccount >= 0 &&
    draft.maxSelectedChatsPerAccount <= 1000000 &&
    Number.isInteger(draft.maxFileMib) &&
    draft.maxFileMib >= 0 &&
    draft.maxFileMib <= 5120
  );
}

function requestError(error: unknown, fallback: ExternalIntegrationAdminError) {
  if (error instanceof MessengerApiError && (error.status === 409 || error.status === 412)) {
    return "conflict" as const;
  }
  return fallback;
}

export function useExternalIntegrationAdmin(
  runtimeContext: WorkspaceRuntimeContext,
): ExternalIntegrationAdminViewModel {
  const [status, setStatus] = useState<ExternalIntegrationAdminStatus>("loading");
  const [policy, setPolicy] = useState<WorkspaceExternalProviderPolicyDto | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [health, setHealth] = useState<WorkspaceExternalProviderHealthDto | null>(null);
  const [draft, setDraft] = useState<ExternalIntegrationAdminDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingSuspension, setChangingSuspension] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ExternalIntegrationAdminError | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setStatus("loading");
      setError(null);
      try {
        const options = buildMessengerRequestOptions(runtimeContext, undefined, signal);
        const [policySnapshot, nextHealth] = await Promise.all([
          getExternalProviderPolicy(options),
          getExternalProviderHealth(options),
        ]);
        if (signal?.aborted) return;
        setPolicy(policySnapshot.policy);
        setEtag(policySnapshot.etag);
        setHealth(nextHealth);
        setDraft(policyDraft(policySnapshot.policy));
        setStatus("ready");
      } catch (requestFailure) {
        if (signal?.aborted) return;
        if (requestFailure instanceof MessengerApiError && requestFailure.status === 403) {
          setStatus("denied");
          return;
        }
        setStatus("error");
        setError("load");
      }
    },
    [runtimeContext],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const updateDraft = useCallback((values: Partial<ExternalIntegrationAdminDraft>) => {
    setDraft((current) => (current == null ? null : { ...current, ...values }));
    setSaved(false);
  }, []);

  const save = useCallback(() => {
    if (saving || draft == null || policy == null || etag == null) return;
    if (!validDraft(draft)) {
      setError("invalid");
      return;
    }
    if (policy.custom_ca_bundle != null) {
      setError("save");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    void updateExternalProviderPolicy(
      buildMessengerRequestOptions(runtimeContext),
      {
        settings: {
          kind: "zulip",
          enabled: draft.enabled,
          limits: {
            max_accounts: draft.maxAccounts,
            max_selected_chats_per_account: draft.maxSelectedChatsPerAccount,
            max_file_bytes: draft.maxFileMib * MEBIBYTE,
          },
          custom_ca_bundle: null,
        },
      },
      etag,
    )
      .then((snapshot) => {
        setPolicy(snapshot.policy);
        setEtag(snapshot.etag);
        setDraft(policyDraft(snapshot.policy));
        setSaved(true);
      })
      .catch((requestFailure: unknown) => setError(requestError(requestFailure, "save")))
      .finally(() => setSaving(false));
  }, [draft, etag, policy, runtimeContext, saving]);

  const changeSuspension = useCallback(() => {
    if (changingSuspension || policy == null) return;
    setChangingSuspension(true);
    setError(null);
    const action = policy.emergency_suspended ? "resume" : "suspend";
    void changeExternalProviderSuspension(buildMessengerRequestOptions(runtimeContext), action)
      .then(async (snapshot) => {
        setPolicy(snapshot.policy);
        setEtag(snapshot.etag);
        const nextHealth = await getExternalProviderHealth(
          buildMessengerRequestOptions(runtimeContext),
        );
        setHealth(nextHealth);
      })
      .catch((requestFailure: unknown) => setError(requestError(requestFailure, "action")))
      .finally(() => setChangingSuspension(false));
  }, [changingSuspension, policy, runtimeContext]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return {
    status,
    policy,
    health,
    draft,
    saving,
    changingSuspension,
    saved,
    error,
    updateDraft,
    save,
    changeSuspension,
    reload,
  };
}
