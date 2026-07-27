import { useCallback, useEffect, useRef, useState } from "react";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getExternalProviderHealth as defaultGetExternalProviderHealth,
  getExternalProviderPolicy as defaultGetExternalProviderPolicy,
  resumeExternalProvider as defaultResumeExternalProvider,
  suspendExternalProvider as defaultSuspendExternalProvider,
  updateExternalProviderPolicy as defaultUpdateExternalProviderPolicy,
} from "~/shared/api/messenger-external-provider-admin.api";
import type {
  WorkspaceExternalProviderHealthDto,
  WorkspaceExternalProviderLimitsDto,
} from "~/shared/api/messenger-external-provider-admin.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import { isAbortError } from "~/shared/lib/abort-error";
import {
  areExternalProviderPolicyDraftsEqual,
  externalProviderPolicyDraft,
  externalProviderPolicyUpdateBody,
  isExternalProviderAccessDeniedError,
  isExternalProviderPolicyConflictError,
  rebaseExternalProviderPolicyDraft,
} from "./manage-external-provider.lib";
import type {
  ExternalProviderActionStatus,
  ExternalProviderOperationError,
  ExternalProviderPolicyDraft,
  ManageExternalProviderState,
} from "./manage-external-provider.types";

type PolicySnapshot = Awaited<ReturnType<typeof defaultGetExternalProviderPolicy>>;

export interface ManageExternalProviderClient {
  getPolicy?: (options: MessengerClientOptions) => Promise<PolicySnapshot>;
  updatePolicy?: (
    options: MessengerClientOptions,
    body: Parameters<typeof defaultUpdateExternalProviderPolicy>[1],
    etag: string,
  ) => Promise<PolicySnapshot>;
  getHealth?: (options: MessengerClientOptions) => Promise<WorkspaceExternalProviderHealthDto>;
  suspend?: (options: MessengerClientOptions) => ReturnType<typeof defaultSuspendExternalProvider>;
  resume?: (options: MessengerClientOptions) => ReturnType<typeof defaultResumeExternalProvider>;
}

export interface UseManageExternalProviderOptions {
  probeEnabled: boolean;
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext | null;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: ManageExternalProviderClient;
}

export interface UseManageExternalProviderResult extends ManageExternalProviderState {
  setEnabled: (enabled: boolean) => void;
  setLimit: (field: keyof WorkspaceExternalProviderLimitsDto, value: number) => void;
  probeAccess: () => void;
  refreshPolicy: () => void;
  refreshHealth: () => void;
  resetDraft: () => void;
  save: () => void;
  suspend: () => void;
  resume: () => void;
  resetOperationState: () => void;
}

const EMPTY_CLIENT: ManageExternalProviderClient = {};

const INITIAL_STATE: ManageExternalProviderState = {
  accessStatus: "idle",
  accessError: null,
  policyStatus: "idle",
  policyError: null,
  policy: null,
  policyEtag: null,
  draft: null,
  healthStatus: "idle",
  healthError: null,
  health: null,
  saveStatus: "idle",
  saveError: null,
  actionStatus: "idle",
  actionError: null,
};

function defaultRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

export function useManageExternalProvider({
  probeEnabled,
  open,
  runtimeContext,
  getRuntimeContext = defaultRuntimeContext,
  client = EMPTY_CLIENT,
}: UseManageExternalProviderOptions): UseManageExternalProviderResult {
  const [state, setState] = useState<ManageExternalProviderState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const runtimeRef = useRef(runtimeContext);
  const getRuntimeContextRef = useRef(getRuntimeContext);
  const clientRef = useRef(client);
  const probeControllerRef = useRef<AbortController | null>(null);
  const policyControllerRef = useRef<AbortController | null>(null);
  const healthControllerRef = useRef<AbortController | null>(null);
  const saveControllerRef = useRef<AbortController | null>(null);
  const actionControllerRef = useRef<AbortController | null>(null);
  const mutationLockRef = useRef<{ kind: "save" | "action"; token: number } | null>(null);
  const mutationSequenceRef = useRef(0);
  const policyRefreshRef = useRef<{
    token: number;
    controller: AbortController;
    ownerMutationToken: number | null;
  } | null>(null);
  const policyRefreshSequenceRef = useRef(0);

  const runtimeOwnerKey =
    runtimeContext == null
      ? null
      : `${workspaceRuntimeOwnerKey(runtimeContext)}:generation:${runtimeContext.runtimeGeneration}`;

  useEffect(() => {
    stateRef.current = state;
    runtimeRef.current = runtimeContext;
    getRuntimeContextRef.current = getRuntimeContext;
    clientRef.current = client;
  }, [client, getRuntimeContext, runtimeContext, state]);

  const abortAll = useCallback(() => {
    probeControllerRef.current?.abort();
    policyControllerRef.current?.abort();
    healthControllerRef.current?.abort();
    saveControllerRef.current?.abort();
    actionControllerRef.current?.abort();
    mutationLockRef.current = null;
    policyRefreshRef.current = null;
  }, []);

  const acquireMutationLock = useCallback((kind: "save" | "action"): number | null => {
    if (mutationLockRef.current != null || policyRefreshRef.current != null) return null;
    mutationSequenceRef.current += 1;
    const token = mutationSequenceRef.current;
    mutationLockRef.current = { kind, token };
    return token;
  }, []);

  const releaseMutationLock = useCallback((token: number) => {
    if (mutationLockRef.current?.token === token) {
      mutationLockRef.current = null;
    }
  }, []);

  const startRequest = useCallback((controllerRef: { current: AbortController | null }) => {
    const requestRuntime = runtimeRef.current;
    if (requestRuntime == null) return null;
    const requestContext = captureWorkspaceRuntimeRequestContext(() => requestRuntime);
    if (requestContext == null) return null;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    return {
      controller,
      requestContext,
      requestRuntime,
      invalidated: () =>
        isWorkspaceRuntimeRequestInvalidated(
          requestContext,
          getRuntimeContextRef.current,
          controller.signal,
        ),
    };
  }, []);

  const applyPolicySnapshot = useCallback((snapshot: PolicySnapshot, replaceDraft: boolean) => {
    setState((current) => ({
      ...current,
      accessStatus: "allowed",
      accessError: null,
      policyStatus: "ready",
      policyError: null,
      policy: snapshot.policy,
      policyEtag: snapshot.etag,
      draft: replaceDraft ? externalProviderPolicyDraft(snapshot.policy) : current.draft,
    }));
  }, []);

  const startPolicyRefresh = useCallback(
    (ownerMutationToken: number | null) => {
      if (policyRefreshRef.current != null) return null;
      const activeMutation = mutationLockRef.current;
      if (
        activeMutation != null &&
        (ownerMutationToken == null || activeMutation.token !== ownerMutationToken)
      ) {
        return null;
      }
      const request = startRequest(policyControllerRef);
      if (request == null) return null;
      policyRefreshSequenceRef.current += 1;
      const token = policyRefreshSequenceRef.current;
      policyRefreshRef.current = {
        token,
        controller: request.controller,
        ownerMutationToken,
      };
      return { ...request, policyRefreshToken: token };
    },
    [startRequest],
  );

  const releasePolicyRefresh = useCallback((token: number) => {
    if (policyRefreshRef.current?.token === token) {
      policyRefreshRef.current = null;
    }
  }, []);

  const probeAccess = useCallback(() => {
    const request = startRequest(probeControllerRef);
    if (request == null) return;
    setState((current) => ({ ...current, accessStatus: "checking", accessError: null }));

    void (async () => {
      try {
        const snapshot = await (clientRef.current.getPolicy ?? defaultGetExternalProviderPolicy)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
        );
        if (request.invalidated()) return;
        applyPolicySnapshot(snapshot, stateRef.current.draft == null);
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        if (isExternalProviderAccessDeniedError(error)) {
          setState((current) => ({
            ...current,
            accessStatus: "denied",
            accessError: "access",
          }));
          return;
        }
        setState((current) => ({ ...current, accessStatus: "error", accessError: "access" }));
      }
    })();
  }, [applyPolicySnapshot, startRequest]);

  const refreshPolicyInternal = useCallback(
    (replaceDraft: boolean, ownerMutationToken: number | null = null) => {
      const request = startPolicyRefresh(ownerMutationToken);
      if (request == null) return Promise.resolve();
      setState((current) => ({
        ...current,
        policyStatus: "loading",
        policyError: null,
      }));

      return (async () => {
        try {
          const snapshot = await (clientRef.current.getPolicy ?? defaultGetExternalProviderPolicy)(
            buildMessengerRequestOptions(
              request.requestRuntime,
              undefined,
              request.controller.signal,
            ),
          );
          if (request.invalidated()) return;
          applyPolicySnapshot(snapshot, replaceDraft);
        } catch (error) {
          if (isAbortError(error) || request.invalidated()) return;
          if (isExternalProviderAccessDeniedError(error)) {
            setState((current) => ({
              ...current,
              accessStatus: "denied",
              accessError: "access",
              policyStatus: "error",
              policyError: "load_policy",
              policy: null,
              policyEtag: null,
              draft: null,
            }));
            return;
          }
          setState((current) => ({
            ...current,
            policyStatus: "error",
            policyError: "load_policy",
          }));
        } finally {
          releasePolicyRefresh(request.policyRefreshToken);
        }
      })();
    },
    [applyPolicySnapshot, releasePolicyRefresh, startPolicyRefresh],
  );

  const refreshPolicy = useCallback(() => {
    void refreshPolicyInternal(true);
  }, [refreshPolicyInternal]);

  const refreshHealthInternal = useCallback(() => {
    const request = startRequest(healthControllerRef);
    if (request == null) return Promise.resolve();
    setState((current) => ({
      ...current,
      healthStatus: "loading",
      healthError: null,
    }));

    return (async () => {
      try {
        const health = await (clientRef.current.getHealth ?? defaultGetExternalProviderHealth)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
        );
        if (request.invalidated()) return;
        setState((current) => ({
          ...current,
          healthStatus: "ready",
          healthError: null,
          health,
        }));
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        setState((current) => ({
          ...current,
          healthStatus: "error",
          healthError: "load_health",
        }));
      }
    })();
  }, [startRequest]);

  const refreshHealth = useCallback(() => {
    void refreshHealthInternal();
  }, [refreshHealthInternal]);

  useEffect(() => {
    abortAll();
    setState(INITIAL_STATE);
    return abortAll;
  }, [abortAll, runtimeOwnerKey]);

  useEffect(() => {
    if (!probeEnabled || open || runtimeOwnerKey == null) {
      probeControllerRef.current?.abort();
      return;
    }
    probeAccess();
    return () => probeControllerRef.current?.abort();
  }, [open, probeAccess, probeEnabled, runtimeOwnerKey]);

  useEffect(() => {
    if (!open || runtimeOwnerKey == null) {
      policyControllerRef.current?.abort();
      healthControllerRef.current?.abort();
      saveControllerRef.current?.abort();
      actionControllerRef.current?.abort();
      mutationLockRef.current = null;
      policyRefreshRef.current = null;
      setState((current) => ({
        ...current,
        saveStatus: "idle",
        saveError: null,
        actionStatus: "idle",
        actionError: null,
      }));
      return;
    }
    void refreshPolicyInternal(true);
    void refreshHealthInternal();
    return () => {
      policyControllerRef.current?.abort();
      healthControllerRef.current?.abort();
      saveControllerRef.current?.abort();
      actionControllerRef.current?.abort();
      mutationLockRef.current = null;
      policyRefreshRef.current = null;
    };
  }, [open, refreshHealthInternal, refreshPolicyInternal, runtimeOwnerKey]);

  const setEnabled = useCallback((enabled: boolean) => {
    setState((current) =>
      current.draft == null
        ? current
        : {
            ...current,
            draft: { ...current.draft, enabled },
            saveStatus: "idle",
            saveError: null,
          },
    );
  }, []);

  const setLimit = useCallback((field: keyof WorkspaceExternalProviderLimitsDto, value: number) => {
    setState((current) =>
      current.draft == null
        ? current
        : {
            ...current,
            draft: {
              ...current.draft,
              limits: { ...current.draft.limits, [field]: value },
            },
            saveStatus: "idle",
            saveError: null,
          },
    );
  }, []);

  const resetDraft = useCallback(() => {
    setState((current) => ({
      ...current,
      draft: current.policy == null ? null : externalProviderPolicyDraft(current.policy),
      saveStatus: "idle",
      saveError: null,
    }));
  }, []);

  const save = useCallback(() => {
    const current = stateRef.current;
    if (current.policy == null || current.draft == null || current.policyEtag == null) return;
    if (current.policy.custom_ca_bundle != null) {
      setState((previous) => ({
        ...previous,
        saveStatus: "blocked",
        saveError: "custom_ca_update_unsupported",
      }));
      return;
    }
    const mutationToken = acquireMutationLock("save");
    if (mutationToken == null) return;
    const request = startRequest(saveControllerRef);
    if (request == null) {
      releaseMutationLock(mutationToken);
      return;
    }
    const draft: ExternalProviderPolicyDraft = {
      enabled: current.draft.enabled,
      limits: { ...current.draft.limits },
    };
    const baseDraft = externalProviderPolicyDraft(current.policy);
    const etag = current.policyEtag;
    setState((previous) => ({ ...previous, saveStatus: "saving", saveError: null }));

    void (async () => {
      try {
        const snapshot = await (
          clientRef.current.updatePolicy ?? defaultUpdateExternalProviderPolicy
        )(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
          externalProviderPolicyUpdateBody(draft),
          etag,
        );
        if (request.invalidated()) return;
        setState((previous) => ({
          ...previous,
          policyStatus: "ready",
          policyError: null,
          policy: snapshot.policy,
          policyEtag: snapshot.etag,
          draft:
            previous.draft == null || areExternalProviderPolicyDraftsEqual(previous.draft, draft)
              ? externalProviderPolicyDraft(snapshot.policy)
              : rebaseExternalProviderPolicyDraft(
                  draft,
                  previous.draft,
                  externalProviderPolicyDraft(snapshot.policy),
                ),
          saveStatus: "saved",
          saveError: null,
        }));
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        if (!isExternalProviderPolicyConflictError(error)) {
          setState((previous) => ({
            ...previous,
            saveStatus: "error",
            saveError: "save",
          }));
          return;
        }

        setState((previous) => ({
          ...previous,
          saveStatus: "conflict",
          saveError: "conflict",
        }));
        try {
          const freshSnapshot = await (
            clientRef.current.getPolicy ?? defaultGetExternalProviderPolicy
          )(
            buildMessengerRequestOptions(
              request.requestRuntime,
              undefined,
              request.controller.signal,
            ),
          );
          if (request.invalidated()) return;
          setState((previous) => ({
            ...previous,
            policyStatus: "ready",
            policyError: null,
            policy: freshSnapshot.policy,
            policyEtag: freshSnapshot.etag,
            draft:
              previous.draft == null
                ? null
                : rebaseExternalProviderPolicyDraft(
                    draft,
                    previous.draft,
                    rebaseExternalProviderPolicyDraft(
                      baseDraft,
                      draft,
                      externalProviderPolicyDraft(freshSnapshot.policy),
                    ),
                  ),
            saveStatus: "conflict",
            saveError: "conflict",
          }));
        } catch (refreshError) {
          if (isAbortError(refreshError) || request.invalidated()) return;
          setState((previous) => ({
            ...previous,
            policyStatus: "error",
            policyError: "load_policy",
            saveStatus: "conflict",
            saveError: "conflict",
          }));
        }
      } finally {
        releaseMutationLock(mutationToken);
      }
    })();
  }, [acquireMutationLock, releaseMutationLock, startRequest]);

  const invokeAction = useCallback(
    (kind: "suspend" | "resume") => {
      const mutationToken = acquireMutationLock("action");
      if (mutationToken == null) return;
      const request = startRequest(actionControllerRef);
      if (request == null) {
        releaseMutationLock(mutationToken);
        return;
      }
      const pendingStatus: ExternalProviderActionStatus =
        kind === "suspend" ? "suspending" : "resuming";
      const actionError: ExternalProviderOperationError = kind === "suspend" ? "suspend" : "resume";
      setState((current) => ({
        ...current,
        actionStatus: pendingStatus,
        actionError: null,
      }));

      void (async () => {
        try {
          const action =
            kind === "suspend"
              ? (clientRef.current.suspend ?? defaultSuspendExternalProvider)
              : (clientRef.current.resume ?? defaultResumeExternalProvider);
          const actionPolicy = await action(
            buildMessengerRequestOptions(
              request.requestRuntime,
              undefined,
              request.controller.signal,
            ),
          );
          if (request.invalidated()) return;
          setState((current) => ({
            ...current,
            policyStatus: "ready",
            policyError: null,
            policy: actionPolicy,
            policyEtag: null,
          }));
          await Promise.allSettled([
            refreshPolicyInternal(false, mutationToken),
            refreshHealthInternal(),
          ]);
          if (request.invalidated()) return;
          setState((current) => ({
            ...current,
            actionStatus: "success",
            actionError: null,
          }));
        } catch (error) {
          if (isAbortError(error) || request.invalidated()) return;
          setState((current) => ({
            ...current,
            actionStatus: "error",
            actionError,
          }));
        } finally {
          releaseMutationLock(mutationToken);
        }
      })();
    },
    [
      acquireMutationLock,
      refreshHealthInternal,
      refreshPolicyInternal,
      releaseMutationLock,
      startRequest,
    ],
  );

  const suspend = useCallback(() => invokeAction("suspend"), [invokeAction]);
  const resume = useCallback(() => invokeAction("resume"), [invokeAction]);

  const resetOperationState = useCallback(() => {
    setState((current) => ({
      ...current,
      saveStatus: "idle",
      saveError: null,
      actionStatus: "idle",
      actionError: null,
    }));
  }, []);

  return {
    ...state,
    setEnabled,
    setLimit,
    probeAccess,
    refreshPolicy,
    refreshHealth,
    resetDraft,
    save,
    suspend,
    resume,
    resetOperationState,
  };
}
