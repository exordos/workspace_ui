import { useCallback, useEffect, useRef, useState } from "react";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createTopicSummaryEndpoint as defaultCreateEndpoint,
  deleteTopicSummaryEndpoint as defaultDeleteEndpoint,
  getTopicSummaryEndpoints as defaultGetEndpoints,
  updateTopicSummaryEndpoint as defaultUpdateEndpoint,
} from "~/shared/api/messenger-topic-summary-management.api";
import type { WorkspaceTopicSummaryEndpointDto } from "~/shared/api/messenger-topic-summary-management.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { isAbortError } from "~/shared/lib/abort-error";
import {
  emptyTopicSummaryEndpointDraft,
  rebaseTopicSummaryEndpointDraft,
  topicSummaryEndpointCreateBody,
  topicSummaryEndpointDraftFromDto,
  topicSummaryEndpointUpdateBody,
  validateTopicSummaryEndpointDraft,
} from "./topic-summary-endpoints.lib";
import { mapTopicSummaryOperationError } from "./topic-summary-settings.lib";
import type {
  TopicSummaryEndpointDraft,
  TopicSummaryEndpointsClient,
  TopicSummaryEndpointsState,
  UseTopicSummaryEndpointsOptions,
  UseTopicSummaryEndpointsResult,
} from "./topic-summary-endpoints.types";

export type {
  TopicSummaryEndpointDraft,
  TopicSummaryEndpointsClient,
  UseTopicSummaryEndpointsOptions,
  UseTopicSummaryEndpointsResult,
} from "./topic-summary-endpoints.types";

const EMPTY_CLIENT: TopicSummaryEndpointsClient = {};

function currentRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

function defaultEndpointUuid(): string {
  return globalThis.crypto.randomUUID();
}

function initialState(
  permission: TopicSummaryEndpointsState["permission"],
): TopicSummaryEndpointsState {
  return {
    permission,
    endpoints: [],
    loadStatus: "idle",
    loadError: null,
    create: { draft: null, validationErrors: {}, status: "idle", error: null },
    edit: {
      endpointUuid: null,
      base: null,
      draft: null,
      validationErrors: {},
      status: "idle",
      error: null,
    },
    remove: { endpointUuid: null, status: "idle", error: null },
  };
}

function isForbiddenError(error: unknown): boolean {
  return error instanceof MessengerApiError && error.status === 403;
}

function sortedEndpoints(
  endpoints: readonly WorkspaceTopicSummaryEndpointDto[],
): WorkspaceTopicSummaryEndpointDto[] {
  return [...endpoints].sort(
    (left, right) => left.priority - right.priority || left.uuid.localeCompare(right.uuid),
  );
}

function upsertEndpoint(
  endpoints: readonly WorkspaceTopicSummaryEndpointDto[],
  endpoint: WorkspaceTopicSummaryEndpointDto,
): WorkspaceTopicSummaryEndpointDto[] {
  return sortedEndpoints([
    ...endpoints.filter((candidate) => candidate.uuid !== endpoint.uuid),
    endpoint,
  ]);
}

function applyEndpointsSnapshot(
  current: TopicSummaryEndpointsState,
  endpoints: readonly WorkspaceTopicSummaryEndpointDto[],
): TopicSummaryEndpointsState {
  const nextEndpoints = sortedEndpoints(endpoints);
  const editedEndpoint =
    current.edit.endpointUuid == null
      ? null
      : (nextEndpoints.find((endpoint) => endpoint.uuid === current.edit.endpointUuid) ?? null);
  if (editedEndpoint == null || current.edit.base == null || current.edit.draft == null) {
    return {
      ...current,
      permission: "allowed",
      endpoints: nextEndpoints,
      loadStatus: "ready",
      loadError: null,
      edit: editedEndpoint == null ? initialState("allowed").edit : current.edit,
    };
  }
  const incoming = topicSummaryEndpointDraftFromDto(editedEndpoint);
  return {
    ...current,
    permission: "allowed",
    endpoints: nextEndpoints,
    loadStatus: "ready",
    loadError: null,
    edit: {
      ...current.edit,
      base: incoming,
      draft: rebaseTopicSummaryEndpointDraft(current.edit.base, current.edit.draft, incoming),
    },
  };
}

function applyEndpointDeletion(
  current: TopicSummaryEndpointsState,
  endpointUuid: string,
): TopicSummaryEndpointsState {
  return {
    ...current,
    endpoints: current.endpoints.filter((endpoint) => endpoint.uuid !== endpointUuid),
    edit:
      current.edit.endpointUuid === endpointUuid
        ? initialState(current.permission).edit
        : current.edit,
    remove: { endpointUuid, status: "success", error: null },
  };
}

export function useTopicSummaryEndpoints({
  open,
  runtimeContext,
  permission,
  getRuntimeContext = currentRuntimeContext,
  client = EMPTY_CLIENT,
  createEndpointUuid = defaultEndpointUuid,
}: UseTopicSummaryEndpointsOptions): UseTopicSummaryEndpointsResult {
  const [state, setState] = useState<TopicSummaryEndpointsState>(() => initialState(permission));
  const stateRef = useRef(state);
  const openRef = useRef(open);
  const runtimeRef = useRef(runtimeContext);
  const getRuntimeContextRef = useRef(getRuntimeContext);
  const clientRef = useRef(client);
  const createEndpointUuidRef = useRef(createEndpointUuid);
  const permissionRef = useRef(permission);
  const loadControllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const mutationRef = useRef<{ token: number; kind: "create" | "update" | "delete" } | null>(null);
  const mutationSequenceRef = useRef(0);

  const runtimeScopeKey =
    runtimeContext == null
      ? null
      : `${workspaceRuntimeOwnerKey(runtimeContext)}:generation:${runtimeContext.runtimeGeneration}`;

  const updateState = useCallback(
    (updater: (current: TopicSummaryEndpointsState) => TopicSummaryEndpointsState) => {
      setState((current) => {
        const next = updater(current);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    stateRef.current = state;
    openRef.current = open;
    runtimeRef.current = runtimeContext;
    getRuntimeContextRef.current = getRuntimeContext;
    clientRef.current = client;
    createEndpointUuidRef.current = createEndpointUuid;
    permissionRef.current = permission;
  }, [client, createEndpointUuid, getRuntimeContext, open, permission, runtimeContext, state]);

  const abortAll = useCallback(() => {
    loadControllerRef.current?.abort();
    mutationControllerRef.current?.abort();
    loadControllerRef.current = null;
    mutationControllerRef.current = null;
    mutationRef.current = null;
  }, []);

  const startRequest = useCallback((controllerRef: { current: AbortController | null }) => {
    const requestRuntime = runtimeRef.current;
    if (!openRef.current || requestRuntime == null) return null;
    const requestContext = captureWorkspaceRuntimeRequestContext(() => requestRuntime);
    if (requestContext == null) return null;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    return {
      controller,
      requestRuntime,
      invalidated: () =>
        !openRef.current ||
        isWorkspaceRuntimeRequestInvalidated(
          requestContext,
          getRuntimeContextRef.current,
          controller.signal,
        ),
    };
  }, []);

  const denyAccess = useCallback(
    (kind: "load" | "create" | "update" | "delete") => {
      abortAll();
      updateState((current) => ({
        ...initialState("denied"),
        loadStatus: kind === "load" ? "error" : current.loadStatus,
        loadError: kind === "load" ? "forbidden" : current.loadError,
        create:
          kind === "create"
            ? { ...initialState("denied").create, status: "error", error: "forbidden" }
            : initialState("denied").create,
        edit:
          kind === "update"
            ? { ...initialState("denied").edit, status: "error", error: "forbidden" }
            : initialState("denied").edit,
        remove:
          kind === "delete"
            ? { ...current.remove, status: "error", error: "forbidden" }
            : initialState("denied").remove,
      }));
    },
    [abortAll, updateState],
  );

  const reload = useCallback(() => {
    if (stateRef.current.permission === "denied") return;
    const request = startRequest(loadControllerRef);
    if (request == null) return;
    updateState((current) => ({
      ...current,
      loadStatus: "loading",
      loadError: null,
    }));

    void (async () => {
      try {
        const endpoints = await (clientRef.current.getEndpoints ?? defaultGetEndpoints)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
        );
        if (request.invalidated()) return;
        updateState((current) => applyEndpointsSnapshot(current, endpoints));
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        if (isForbiddenError(error)) {
          useWorkspaceIamCapabilitiesStore
            .getState()
            .invalidate(workspaceRuntimeOwnerKey(request.requestRuntime));
          denyAccess("load");
          return;
        }
        updateState((current) => ({
          ...current,
          loadStatus: "error",
          loadError: mapTopicSummaryOperationError(error),
        }));
      }
    })();
  }, [denyAccess, startRequest, updateState]);

  useEffect(() => {
    abortAll();
    updateState(() => initialState(permissionRef.current));
    return abortAll;
  }, [abortAll, runtimeScopeKey, updateState]);

  useEffect(() => {
    if (permission === "denied") {
      abortAll();
      updateState(() => initialState("denied"));
      return;
    }
    updateState((current) => ({
      ...current,
      permission:
        permission === "unknown" && current.permission === "allowed" ? "allowed" : permission,
    }));
  }, [abortAll, permission, updateState]);

  useEffect(() => {
    if (!open || runtimeScopeKey == null || permission === "denied") {
      abortAll();
      updateState(() => initialState(permission));
      return;
    }
    reload();
    return abortAll;
  }, [abortAll, open, permission, reload, runtimeScopeKey, updateState]);

  const startCreate = useCallback(() => {
    if (stateRef.current.permission !== "allowed" || mutationRef.current != null) return;
    updateState((current) => ({
      ...current,
      create: {
        draft: emptyTopicSummaryEndpointDraft(createEndpointUuidRef.current()),
        validationErrors: {},
        status: "idle",
        error: null,
      },
    }));
  }, [updateState]);

  const setCreateField = useCallback(
    <Field extends keyof TopicSummaryEndpointDraft>(
      field: Field,
      value: TopicSummaryEndpointDraft[Field],
    ) => {
      updateState((current) =>
        current.create.draft == null || current.create.status === "pending"
          ? current
          : {
              ...current,
              create: {
                ...current.create,
                draft: { ...current.create.draft, [field]: value },
                validationErrors: {},
                status: "idle",
                error: null,
              },
            },
      );
    },
    [updateState],
  );

  const cancelCreate = useCallback(() => {
    if (stateRef.current.create.status === "pending") return;
    updateState((current) => ({ ...current, create: initialState(current.permission).create }));
  }, [updateState]);

  const acquireMutation = useCallback(
    (kind: "create" | "update" | "delete") => {
      if (mutationRef.current != null || stateRef.current.permission !== "allowed") return null;
      const request = startRequest(mutationControllerRef);
      if (request == null) return null;
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
      mutationSequenceRef.current += 1;
      const token = mutationSequenceRef.current;
      mutationRef.current = { token, kind };
      return { ...request, token };
    },
    [startRequest],
  );

  const releaseMutation = useCallback((token: number) => {
    if (mutationRef.current?.token === token) {
      mutationRef.current = null;
      mutationControllerRef.current = null;
    }
  }, []);

  const createEndpoint = useCallback(() => {
    const draft = stateRef.current.create.draft;
    if (draft == null || stateRef.current.create.status === "pending") return;
    const validationErrors = validateTopicSummaryEndpointDraft(draft, "create");
    if (Object.keys(validationErrors).length > 0) {
      updateState((current) => ({
        ...current,
        create: {
          ...current.create,
          validationErrors,
          status: "error",
          error: "invalid",
        },
      }));
      return;
    }
    const request = acquireMutation("create");
    if (request == null) return;
    const body = topicSummaryEndpointCreateBody(draft);
    updateState((current) => ({
      ...current,
      create: {
        ...current.create,
        draft: current.create.draft == null ? null : { ...current.create.draft, apiKey: "" },
        validationErrors: {},
        status: "pending",
        error: null,
      },
    }));

    void (async () => {
      try {
        const endpoint = await (clientRef.current.createEndpoint ?? defaultCreateEndpoint)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
          body,
        );
        if (request.invalidated()) return;
        updateState((current) => ({
          ...current,
          permission: "allowed",
          endpoints: upsertEndpoint(current.endpoints, endpoint),
          create: { ...initialState("allowed").create, status: "success" },
        }));
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        if (isForbiddenError(error)) {
          useWorkspaceIamCapabilitiesStore
            .getState()
            .invalidate(workspaceRuntimeOwnerKey(request.requestRuntime));
          denyAccess("create");
          return;
        }
        updateState((current) => ({
          ...current,
          create: {
            ...current.create,
            status: "error",
            error: mapTopicSummaryOperationError(error),
          },
        }));
      } finally {
        releaseMutation(request.token);
      }
    })();
  }, [acquireMutation, denyAccess, releaseMutation, updateState]);

  const startEdit = useCallback(
    (endpointUuid: string) => {
      if (stateRef.current.permission !== "allowed" || mutationRef.current != null) return;
      const endpoint = stateRef.current.endpoints.find((item) => item.uuid === endpointUuid);
      if (endpoint == null) return;
      const draft = topicSummaryEndpointDraftFromDto(endpoint);
      updateState((current) => ({
        ...current,
        edit: {
          endpointUuid,
          base: draft,
          draft,
          validationErrors: {},
          status: "idle",
          error: null,
        },
      }));
    },
    [updateState],
  );

  const setEditField = useCallback(
    <Field extends keyof TopicSummaryEndpointDraft>(
      field: Field,
      value: TopicSummaryEndpointDraft[Field],
    ) => {
      if (field === "uuid") return;
      updateState((current) =>
        current.edit.draft == null || current.edit.status === "pending"
          ? current
          : {
              ...current,
              edit: {
                ...current.edit,
                draft: { ...current.edit.draft, [field]: value },
                validationErrors: {},
                status: "idle",
                error: null,
              },
            },
      );
    },
    [updateState],
  );

  const cancelEdit = useCallback(() => {
    if (stateRef.current.edit.status === "pending") return;
    updateState((current) => ({ ...current, edit: initialState(current.permission).edit }));
  }, [updateState]);

  const updateEndpoint = useCallback(() => {
    const currentEdit = stateRef.current.edit;
    if (
      currentEdit.endpointUuid == null ||
      currentEdit.base == null ||
      currentEdit.draft == null ||
      currentEdit.status === "pending"
    ) {
      return;
    }
    const validationErrors = validateTopicSummaryEndpointDraft(currentEdit.draft, "update");
    if (Object.keys(validationErrors).length > 0) {
      updateState((current) => ({
        ...current,
        edit: { ...current.edit, validationErrors, status: "error", error: "invalid" },
      }));
      return;
    }
    const body = topicSummaryEndpointUpdateBody(currentEdit.base, currentEdit.draft);
    if (body == null) return;
    const request = acquireMutation("update");
    if (request == null) return;
    const endpointUuid = currentEdit.endpointUuid;
    updateState((current) => ({
      ...current,
      edit: {
        ...current.edit,
        draft: current.edit.draft == null ? null : { ...current.edit.draft, apiKey: "" },
        validationErrors: {},
        status: "pending",
        error: null,
      },
    }));

    void (async () => {
      try {
        const endpoint = await (clientRef.current.updateEndpoint ?? defaultUpdateEndpoint)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
          endpointUuid,
          body,
        );
        if (request.invalidated()) return;
        updateState((current) => ({
          ...current,
          permission: "allowed",
          endpoints: upsertEndpoint(current.endpoints, endpoint),
          edit: { ...initialState("allowed").edit, status: "success" },
        }));
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        if (isForbiddenError(error)) {
          useWorkspaceIamCapabilitiesStore
            .getState()
            .invalidate(workspaceRuntimeOwnerKey(request.requestRuntime));
          denyAccess("update");
          return;
        }
        updateState((current) => ({
          ...current,
          edit: {
            ...current.edit,
            status: "error",
            error: mapTopicSummaryOperationError(error),
          },
        }));
      } finally {
        releaseMutation(request.token);
      }
    })();
  }, [acquireMutation, denyAccess, releaseMutation, updateState]);

  const deleteEndpoint = useCallback(
    (endpointUuid: string) => {
      if (stateRef.current.remove.status === "pending") return;
      const request = acquireMutation("delete");
      if (request == null) return;
      updateState((current) => ({
        ...current,
        remove: { endpointUuid, status: "pending", error: null },
      }));

      void (async () => {
        try {
          await (clientRef.current.deleteEndpoint ?? defaultDeleteEndpoint)(
            buildMessengerRequestOptions(
              request.requestRuntime,
              undefined,
              request.controller.signal,
            ),
            endpointUuid,
          );
          if (request.invalidated()) return;
          updateState((current) => applyEndpointDeletion(current, endpointUuid));
        } catch (error) {
          if (isAbortError(error) || request.invalidated()) return;
          if (isForbiddenError(error)) {
            useWorkspaceIamCapabilitiesStore
              .getState()
              .invalidate(workspaceRuntimeOwnerKey(request.requestRuntime));
            denyAccess("delete");
            return;
          }
          updateState((current) => ({
            ...current,
            remove: {
              endpointUuid,
              status: "error",
              error: mapTopicSummaryOperationError(error),
            },
          }));
        } finally {
          releaseMutation(request.token);
        }
      })();
    },
    [acquireMutation, denyAccess, releaseMutation, updateState],
  );

  return {
    ...state,
    reload,
    startCreate,
    setCreateField,
    cancelCreate,
    createEndpoint,
    startEdit,
    setEditField,
    cancelEdit,
    updateEndpoint,
    deleteEndpoint,
  };
}
