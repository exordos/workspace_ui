import { useCallback, useEffect, useRef, useState } from "react";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { updateMessengerTopicSummaryConfiguration as defaultUpdateTopic } from "~/entities/messenger/messenger-topic-summary-actions.lib";
import type { MessengerTopic, MessengerUuid } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getTopicSummarySettings as defaultGetSettings,
  updateTopicSummarySettings as defaultUpdateSettings,
} from "~/shared/api/messenger-topic-summary-management.api";
import type {
  WorkspaceTopicSummarySettingsDto,
  WorkspaceTopicSummarySettingsUpdateRequestBody,
} from "~/shared/api/messenger-topic-summary-management.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import { isAbortError } from "~/shared/lib/abort-error";
import {
  areTopicSummaryGatesDraftsEqual,
  diffTopicSummaryDraft,
  dirtyTopicSummaryFields,
  mapTopicSummaryOperationError,
  normalizeTopicSummaryDraft,
  rebaseTopicSummaryDraft,
  rebaseTopicSummaryGatesDraft,
  topicSummaryDraftFromTopic,
  topicSummaryGatesDraftFromSettings,
  topicSummaryGatesUpdateBody,
  validateTopicSummaryDraft,
} from "./topic-summary-settings.lib";
import type {
  TopicSummaryGatesDraft,
  TopicSummaryPermission,
  TopicSummarySettingsState,
  TopicSummaryTopicDraft,
} from "./topic-summary-settings.types";

type UpdateTopicOptions = Parameters<typeof defaultUpdateTopic>[0];
type UpdateTopicResult = Awaited<ReturnType<typeof defaultUpdateTopic>>;

export interface TopicSummarySettingsClient {
  getSettings?: (
    options: MessengerClientOptions,
    projectUuid: string,
  ) => Promise<WorkspaceTopicSummarySettingsDto>;
  updateSettings?: (
    options: MessengerClientOptions,
    projectUuid: string,
    body: WorkspaceTopicSummarySettingsUpdateRequestBody,
  ) => Promise<WorkspaceTopicSummarySettingsDto>;
  updateTopic?: (options: UpdateTopicOptions) => Promise<UpdateTopicResult>;
}

export interface UseTopicSummarySettingsOptions {
  open: boolean;
  runtimeContext: WorkspaceRuntimeContext | null;
  topic: MessengerTopic | null;
  topicPermission?: TopicSummaryPermission;
  gatesPermission?: TopicSummaryPermission;
  loadGatesOnOpen?: boolean;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: TopicSummarySettingsClient;
}

export interface UseTopicSummarySettingsResult extends TopicSummarySettingsState {
  setTopicEnabled: (enabled: boolean) => void;
  setTopicSystemPrompt: (prompt: string | null) => void;
  setTopicReasoningEffort: (effort: TopicSummaryTopicDraft["summaryReasoningEffort"]) => void;
  resetTopicDraft: () => void;
  saveTopic: () => void;
  setGlobalEnabled: (enabled: boolean) => void;
  setProjectEnabled: (enabled: boolean) => void;
  resetGatesDraft: () => void;
  loadGates: () => void;
  saveGates: () => void;
}

const EMPTY_CLIENT: TopicSummarySettingsClient = {};

function defaultRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

function initialState(
  topic: MessengerTopic | null,
  topicPermission: TopicSummaryPermission,
  permission: TopicSummaryPermission,
): TopicSummarySettingsState {
  const topicDraft = topic == null ? null : topicSummaryDraftFromTopic(topic);
  return {
    topic: {
      base: topicDraft,
      draft: topicDraft,
      dirtyFields: [],
      status: "idle",
      error: null,
      validationError: null,
      permission: topicPermission,
    },
    gates: {
      server: null,
      draft: null,
      dirty: false,
      loadStatus: "idle",
      saveStatus: "idle",
      error: null,
      permission,
    },
  };
}

function deriveState(state: TopicSummarySettingsState): TopicSummarySettingsState {
  const serverGates =
    state.gates.server == null ? null : topicSummaryGatesDraftFromSettings(state.gates.server);
  return {
    ...state,
    topic: {
      ...state.topic,
      dirtyFields: dirtyTopicSummaryFields(state.topic.base, state.topic.draft),
      validationError:
        state.topic.draft == null ? null : validateTopicSummaryDraft(state.topic.draft),
    },
    gates: {
      ...state.gates,
      dirty:
        serverGates != null &&
        state.gates.draft != null &&
        !areTopicSummaryGatesDraftsEqual(serverGates, state.gates.draft),
    },
  };
}

function topicConfigurationKey(topic: MessengerTopic | null): string | null {
  if (topic == null) return null;
  return JSON.stringify([
    topic.uuid,
    topic.summaryEnabled ?? true,
    topic.summarySystemPrompt ?? null,
    topic.summaryReasoningEffort ?? null,
  ]);
}

export function useTopicSummarySettings({
  open,
  runtimeContext,
  topic,
  topicPermission = "unknown",
  gatesPermission = "unknown",
  loadGatesOnOpen = true,
  getRuntimeContext = defaultRuntimeContext,
  client = EMPTY_CLIENT,
}: UseTopicSummarySettingsOptions): UseTopicSummarySettingsResult {
  const [state, setState] = useState(() =>
    deriveState(initialState(topic, topicPermission, gatesPermission)),
  );
  const stateRef = useRef(state);
  const openRef = useRef(open);
  const runtimeRef = useRef(runtimeContext);
  const topicRef = useRef(topic);
  const topicPermissionRef = useRef(topicPermission);
  const gatesPermissionRef = useRef(gatesPermission);
  const getRuntimeContextRef = useRef(getRuntimeContext);
  const clientRef = useRef(client);
  const gatesLoadControllerRef = useRef<AbortController | null>(null);
  const gatesSaveControllerRef = useRef<AbortController | null>(null);
  const topicSaveControllerRef = useRef<AbortController | null>(null);

  const runtimeScopeKey =
    runtimeContext == null
      ? null
      : `${workspaceRuntimeOwnerKey(runtimeContext)}:generation:${runtimeContext.runtimeGeneration}`;
  const topicIdentity = topic == null ? null : `${runtimeScopeKey ?? "no-runtime"}:${topic.uuid}`;
  const topicConfigKey = topicConfigurationKey(topic);

  const updateState = useCallback(
    (updater: (current: TopicSummarySettingsState) => TopicSummarySettingsState) => {
      setState((current) => {
        const next = deriveState(updater(current));
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
    topicRef.current = topic;
    topicPermissionRef.current = topicPermission;
    gatesPermissionRef.current = gatesPermission;
    getRuntimeContextRef.current = getRuntimeContext;
    clientRef.current = client;
  }, [
    client,
    gatesPermission,
    getRuntimeContext,
    open,
    runtimeContext,
    state,
    topic,
    topicPermission,
  ]);

  const abortAll = useCallback(() => {
    gatesLoadControllerRef.current?.abort();
    gatesSaveControllerRef.current?.abort();
    topicSaveControllerRef.current?.abort();
    gatesLoadControllerRef.current = null;
    gatesSaveControllerRef.current = null;
    topicSaveControllerRef.current = null;
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

  useEffect(() => {
    abortAll();
    updateState(() =>
      initialState(topicRef.current, topicPermissionRef.current, gatesPermissionRef.current),
    );
    return abortAll;
  }, [abortAll, runtimeScopeKey, updateState]);

  useEffect(() => {
    topicSaveControllerRef.current?.abort();
    topicSaveControllerRef.current = null;
    updateState((current) => {
      const topicDraft =
        topicRef.current == null ? null : topicSummaryDraftFromTopic(topicRef.current);
      return {
        ...current,
        topic: {
          base: topicDraft,
          draft: topicDraft,
          dirtyFields: [],
          status: "idle",
          error: null,
          validationError: null,
          permission: topicPermissionRef.current,
        },
      };
    });
    return () => topicSaveControllerRef.current?.abort();
  }, [topicIdentity, updateState]);

  useEffect(() => {
    if (topicPermission === "denied") {
      topicSaveControllerRef.current?.abort();
      topicSaveControllerRef.current = null;
    }
    updateState((current) => {
      if (topicPermission === "unknown" && current.topic.permission !== "unknown") {
        return current;
      }
      return {
        ...current,
        topic: {
          ...current.topic,
          permission: topicPermission,
          draft:
            topicPermission === "denied" && current.topic.base != null
              ? current.topic.base
              : current.topic.draft,
          status: topicPermission === "denied" ? "idle" : current.topic.status,
          error: topicPermission === "denied" ? null : current.topic.error,
        },
      };
    });
  }, [topicPermission, updateState]);

  useEffect(() => {
    if (gatesPermission === "denied") {
      gatesSaveControllerRef.current?.abort();
      gatesSaveControllerRef.current = null;
    }
    updateState((current) => {
      if (gatesPermission === "unknown" && current.gates.permission !== "unknown") {
        return current;
      }
      return {
        ...current,
        gates: {
          ...current.gates,
          permission: gatesPermission,
          draft:
            gatesPermission === "denied" && current.gates.server != null
              ? topicSummaryGatesDraftFromSettings(current.gates.server)
              : current.gates.draft,
        },
      };
    });
  }, [gatesPermission, updateState]);

  useEffect(() => {
    const currentTopic = topicRef.current;
    if (currentTopic == null) return;
    const incoming = topicSummaryDraftFromTopic(currentTopic);
    updateState((current) => {
      if (current.topic.base == null || current.topic.draft == null) {
        return {
          ...current,
          topic: { ...current.topic, base: incoming, draft: incoming },
        };
      }
      return {
        ...current,
        topic: {
          ...current.topic,
          base: incoming,
          draft: rebaseTopicSummaryDraft(current.topic.base, current.topic.draft, incoming),
        },
      };
    });
  }, [topicConfigKey, updateState]);

  const loadGates = useCallback(() => {
    if (stateRef.current.gates.saveStatus === "saving") return;
    const request = startRequest(gatesLoadControllerRef);
    if (request == null) return;
    updateState((current) => ({
      ...current,
      gates: { ...current.gates, loadStatus: "loading", error: null },
    }));

    void (async () => {
      try {
        const settings = await (clientRef.current.getSettings ?? defaultGetSettings)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
          request.requestRuntime.projectId,
        );
        if (request.invalidated()) return;
        const incoming = topicSummaryGatesDraftFromSettings(settings);
        updateState((current) => {
          const previousBase =
            current.gates.server == null
              ? null
              : topicSummaryGatesDraftFromSettings(current.gates.server);
          const nextDraft =
            previousBase == null || current.gates.draft == null
              ? incoming
              : rebaseTopicSummaryGatesDraft(previousBase, current.gates.draft, incoming);
          return {
            ...current,
            gates: {
              ...current.gates,
              server: settings,
              draft: nextDraft,
              loadStatus: "ready",
              error: null,
            },
          };
        });
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        const mapped = mapTopicSummaryOperationError(error);
        if (mapped === "forbidden") {
          useWorkspaceIamCapabilitiesStore
            .getState()
            .invalidate(workspaceRuntimeOwnerKey(request.requestRuntime));
        }
        updateState((current) => ({
          ...current,
          gates: {
            ...current.gates,
            loadStatus: "error",
            error: mapped,
            permission: mapped === "forbidden" ? "denied" : current.gates.permission,
            draft:
              mapped === "forbidden" && current.gates.server != null
                ? topicSummaryGatesDraftFromSettings(current.gates.server)
                : current.gates.draft,
          },
        }));
      }
    })();
  }, [startRequest, updateState]);

  useEffect(() => {
    if (!open || runtimeScopeKey == null) {
      abortAll();
      updateState((current) => ({
        ...current,
        gates: {
          ...current.gates,
          server: null,
          draft: null,
          dirty: false,
          loadStatus: "idle",
          saveStatus: "idle",
          error: null,
          permission: gatesPermissionRef.current,
        },
        topic: {
          ...current.topic,
          status: "idle",
          error: null,
        },
      }));
      return;
    }
    if (loadGatesOnOpen) {
      loadGates();
    }
    return abortAll;
  }, [abortAll, loadGates, loadGatesOnOpen, open, runtimeScopeKey, updateState]);

  const updateTopicDraft = useCallback(
    (patch: Partial<TopicSummaryTopicDraft>) => {
      updateState((current) =>
        current.topic.draft == null || current.topic.permission === "denied"
          ? current
          : {
              ...current,
              topic: {
                ...current.topic,
                draft: { ...current.topic.draft, ...patch },
                status: "idle",
                error: null,
              },
            },
      );
    },
    [updateState],
  );

  const setTopicEnabled = useCallback(
    (enabled: boolean) => updateTopicDraft({ summaryEnabled: enabled }),
    [updateTopicDraft],
  );
  const setTopicSystemPrompt = useCallback(
    (prompt: string | null) => updateTopicDraft({ summarySystemPrompt: prompt }),
    [updateTopicDraft],
  );
  const setTopicReasoningEffort = useCallback(
    (effort: TopicSummaryTopicDraft["summaryReasoningEffort"]) =>
      updateTopicDraft({ summaryReasoningEffort: effort }),
    [updateTopicDraft],
  );

  const resetTopicDraft = useCallback(() => {
    updateState((current) => ({
      ...current,
      topic: {
        ...current.topic,
        draft: current.topic.base,
        status: "idle",
        error: null,
      },
    }));
  }, [updateState]);

  const saveTopic = useCallback(() => {
    const current = stateRef.current;
    const currentTopic = topicRef.current;
    if (
      current.topic.base == null ||
      current.topic.draft == null ||
      currentTopic == null ||
      current.topic.status === "saving"
    ) {
      return;
    }
    if (current.topic.permission === "denied") {
      updateState((previous) => ({
        ...previous,
        topic: { ...previous.topic, status: "error", error: "forbidden" },
      }));
      return;
    }
    const validationError = validateTopicSummaryDraft(current.topic.draft);
    if (validationError != null) {
      updateState((previous) => ({
        ...previous,
        topic: { ...previous.topic, status: "error", error: "invalid" },
      }));
      return;
    }
    const body = diffTopicSummaryDraft(current.topic.base, current.topic.draft);
    if (body == null) return;
    const request = startRequest(topicSaveControllerRef);
    if (request == null) return;
    const requestDraft = normalizeTopicSummaryDraft(current.topic.draft);
    const topicUuid: MessengerUuid = currentTopic.uuid;
    updateState((previous) => ({
      ...previous,
      topic: { ...previous.topic, status: "saving", error: null },
    }));

    void (async () => {
      try {
        const result = await (clientRef.current.updateTopic ?? defaultUpdateTopic)({
          runtimeContext: request.requestRuntime,
          topicUuid,
          body,
          getRuntimeContext: getRuntimeContextRef.current,
          signal: request.controller.signal,
        });
        if (request.invalidated()) return;
        if (result.status !== "applied") {
          updateState((previous) => ({
            ...previous,
            topic: { ...previous.topic, status: "idle", error: null },
          }));
          return;
        }
        const incoming = topicSummaryDraftFromTopic(result.topic);
        updateState((previous) => ({
          ...previous,
          topic: {
            ...previous.topic,
            base: incoming,
            draft:
              previous.topic.draft == null
                ? incoming
                : rebaseTopicSummaryDraft(requestDraft, previous.topic.draft, incoming),
            status: "saved",
            error: null,
            permission: "allowed",
          },
        }));
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        const mapped = mapTopicSummaryOperationError(error);
        updateState((previous) => ({
          ...previous,
          topic: {
            ...previous.topic,
            draft:
              mapped === "forbidden" && previous.topic.base != null
                ? previous.topic.base
                : previous.topic.draft,
            status: "error",
            error: mapped,
            permission: mapped === "forbidden" ? "denied" : previous.topic.permission,
          },
        }));
      }
    })();
  }, [startRequest, updateState]);

  const updateGatesDraft = useCallback(
    (patch: Partial<TopicSummaryGatesDraft>) => {
      updateState((current) =>
        current.gates.draft == null || current.gates.permission === "denied"
          ? current
          : {
              ...current,
              gates: {
                ...current.gates,
                draft: { ...current.gates.draft, ...patch },
                saveStatus: "idle",
                error: null,
              },
            },
      );
    },
    [updateState],
  );

  const setGlobalEnabled = useCallback(
    (enabled: boolean) => updateGatesDraft({ globalEnabled: enabled }),
    [updateGatesDraft],
  );
  const setProjectEnabled = useCallback(
    (enabled: boolean) => updateGatesDraft({ projectEnabled: enabled }),
    [updateGatesDraft],
  );

  const resetGatesDraft = useCallback(() => {
    updateState((current) => ({
      ...current,
      gates: {
        ...current.gates,
        draft:
          current.gates.server == null
            ? null
            : topicSummaryGatesDraftFromSettings(current.gates.server),
        saveStatus: "idle",
        error: null,
      },
    }));
  }, [updateState]);

  const saveGates = useCallback(() => {
    const current = stateRef.current;
    if (
      current.gates.server == null ||
      current.gates.draft == null ||
      !current.gates.dirty ||
      current.gates.saveStatus === "saving"
    ) {
      return;
    }
    if (current.gates.permission === "denied") {
      updateState((previous) => ({
        ...previous,
        gates: { ...previous.gates, saveStatus: "error", error: "forbidden" },
      }));
      return;
    }
    const request = startRequest(gatesSaveControllerRef);
    if (request == null) return;
    gatesLoadControllerRef.current?.abort();
    gatesLoadControllerRef.current = null;
    const baseAtStart = topicSummaryGatesDraftFromSettings(current.gates.server);
    const draftAtStart = { ...current.gates.draft };
    updateState((previous) => ({
      ...previous,
      gates: { ...previous.gates, saveStatus: "saving", error: null },
    }));

    void (async () => {
      let latestSettings: WorkspaceTopicSummarySettingsDto | null = null;
      try {
        latestSettings = await (clientRef.current.getSettings ?? defaultGetSettings)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
          request.requestRuntime.projectId,
        );
        if (request.invalidated()) return;
        const latestDraft = topicSummaryGatesDraftFromSettings(latestSettings);
        const draftForUpdate = rebaseTopicSummaryGatesDraft(baseAtStart, draftAtStart, latestDraft);
        const settings = await (clientRef.current.updateSettings ?? defaultUpdateSettings)(
          buildMessengerRequestOptions(
            request.requestRuntime,
            undefined,
            request.controller.signal,
          ),
          request.requestRuntime.projectId,
          topicSummaryGatesUpdateBody(draftForUpdate),
        );
        if (request.invalidated()) return;
        const incoming = topicSummaryGatesDraftFromSettings(settings);
        updateState((previous) => {
          const latestLocal =
            previous.gates.draft == null
              ? draftForUpdate
              : rebaseTopicSummaryGatesDraft(baseAtStart, previous.gates.draft, latestDraft);
          return {
            ...previous,
            gates: {
              ...previous.gates,
              server: settings,
              draft: rebaseTopicSummaryGatesDraft(draftForUpdate, latestLocal, incoming),
              loadStatus: "ready",
              saveStatus: "saved",
              error: null,
              permission: "allowed",
            },
          };
        });
      } catch (error) {
        if (isAbortError(error) || request.invalidated()) return;
        const mapped = mapTopicSummaryOperationError(error);
        if (mapped === "forbidden") {
          useWorkspaceIamCapabilitiesStore
            .getState()
            .invalidate(workspaceRuntimeOwnerKey(request.requestRuntime));
        }
        updateState((previous) => {
          const rollbackSettings = latestSettings ?? previous.gates.server;
          return {
            ...previous,
            gates: {
              ...previous.gates,
              server: rollbackSettings,
              draft:
                mapped === "forbidden" && rollbackSettings != null
                  ? topicSummaryGatesDraftFromSettings(rollbackSettings)
                  : previous.gates.draft,
              loadStatus: latestSettings == null ? previous.gates.loadStatus : "ready",
              saveStatus: "error",
              error: mapped,
              permission: mapped === "forbidden" ? "denied" : previous.gates.permission,
            },
          };
        });
      }
    })();
  }, [startRequest, updateState]);

  return {
    ...state,
    setTopicEnabled,
    setTopicSystemPrompt,
    setTopicReasoningEffort,
    resetTopicDraft,
    saveTopic,
    setGlobalEnabled,
    setProjectEnabled,
    resetGatesDraft,
    loadGates,
    saveGates,
  };
}
