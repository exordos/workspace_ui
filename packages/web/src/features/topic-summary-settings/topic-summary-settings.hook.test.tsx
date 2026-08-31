import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceTopicSummarySettingsDto } from "~/shared/api/messenger-topic-summary-management.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import {
  type TopicSummarySettingsClient,
  useTopicSummarySettings,
} from "./topic-summary-settings.hook";

const PROJECT_UUID = "00000000-0000-4000-8000-000000000001";

afterEach(() => useWorkspaceIamCapabilitiesStore.getState().clear());

function runtime(projectId = PROJECT_UUID, runtimeGeneration = 1): WorkspaceRuntimeContext {
  return {
    accountId: "account-1",
    instanceId: "instance-1",
    organizationId: "organization-1",
    projectId,
    userUuid: "00000000-0000-4000-8000-000000000003",
    organizationOrigin: "https://workspace.example.com",
    accessToken: "token",
    runtimeGeneration,
  };
}

function topic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: "00000000-0000-4000-8000-000000000010",
    projectId: PROJECT_UUID,
    streamUuid: "00000000-0000-4000-8000-000000000002",
    userUuid: "00000000-0000-4000-8000-000000000003",
    name: "Roadmap",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    summaryEnabled: true,
    summarySystemPrompt: null,
    summaryReasoningEffort: null,
    createdAt: "2026-08-21T10:00:00Z",
    updatedAt: "2026-08-21T10:00:00Z",
    ...overrides,
  };
}

function settings(globalEnabled = true, projectEnabled = true): WorkspaceTopicSummarySettingsDto {
  return {
    project_id: PROJECT_UUID,
    global_enabled: globalEnabled,
    project_enabled: projectEnabled,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useTopicSummarySettings topic model", () => {
  it("rebases untouched fields from realtime while preserving a dirty prompt", async () => {
    const currentRuntime = runtime();
    const getSettings = vi.fn().mockResolvedValue(settings());
    const client: TopicSummarySettingsClient = { getSettings };
    const { result, rerender } = renderHook(
      ({ currentTopic }) =>
        useTopicSummarySettings({
          open: true,
          runtimeContext: currentRuntime,
          topic: currentTopic,
          getRuntimeContext: () => currentRuntime,
          client,
        }),
      { initialProps: { currentTopic: topic() } },
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    act(() => result.current.setTopicSystemPrompt("Local prompt"));
    rerender({
      currentTopic: topic({
        summaryEnabled: false,
        summarySystemPrompt: "Remote prompt",
        summaryReasoningEffort: "high",
        updatedAt: "2026-08-21T10:01:00Z",
      }),
    });

    await waitFor(() => expect(result.current.topic.draft?.summaryEnabled).toBe(false));
    expect(result.current.topic.draft).toMatchObject({
      summaryEnabled: false,
      summarySystemPrompt: "Local prompt",
      summaryReasoningEffort: "high",
    });
    expect(result.current.topic.dirtyFields).toEqual(["summary_system_prompt"]);
  });

  it("sends only dirty topic fields and trims the prompt", async () => {
    const currentRuntime = runtime();
    const updateTopic = vi.fn().mockImplementation(({ body }) =>
      Promise.resolve({
        status: "applied" as const,
        ownerKey: "owner",
        topic: topic({ summarySystemPrompt: body.summary_system_prompt ?? null }),
        source: "response" as const,
      }),
    );
    const { result } = renderHook(() =>
      useTopicSummarySettings({
        open: true,
        runtimeContext: currentRuntime,
        topic: topic(),
        getRuntimeContext: () => currentRuntime,
        client: {
          getSettings: vi.fn().mockResolvedValue(settings()),
          updateTopic,
        },
      }),
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    act(() => result.current.setTopicSystemPrompt("  Decisions only  "));
    act(() => result.current.saveTopic());

    await waitFor(() => expect(result.current.topic.status).toBe("saved"));
    expect(updateTopic).toHaveBeenCalledWith(
      expect.objectContaining({ body: { summary_system_prompt: "Decisions only" } }),
    );
    expect(result.current.topic.dirtyFields).toEqual([]);
  });

  it("returns to idle when the domain action is superseded", async () => {
    const currentRuntime = runtime();
    const updateTopic = vi.fn().mockResolvedValue({
      status: "skipped" as const,
      ownerKey: "owner",
      reason: "superseded" as const,
    });
    const { result } = renderHook(() =>
      useTopicSummarySettings({
        open: true,
        runtimeContext: currentRuntime,
        topic: topic(),
        getRuntimeContext: () => currentRuntime,
        client: {
          getSettings: vi.fn().mockResolvedValue(settings()),
          updateTopic,
        },
      }),
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    act(() => result.current.setTopicEnabled(false));
    act(() => result.current.saveTopic());

    await waitFor(() => expect(updateTopic).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.topic.status).toBe("idle"));
    expect(result.current.topic.dirtyFields).toEqual(["summary_enabled"]);
  });

  it("keeps topic controls read-only when explicit permission is denied", async () => {
    const currentRuntime = runtime();
    const updateTopic = vi.fn();
    const { result } = renderHook(() =>
      useTopicSummarySettings({
        open: true,
        runtimeContext: currentRuntime,
        topic: topic(),
        topicPermission: "denied",
        getRuntimeContext: () => currentRuntime,
        client: {
          getSettings: vi.fn().mockResolvedValue(settings()),
          updateTopic,
        },
      }),
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    act(() => result.current.setTopicEnabled(false));
    act(() => result.current.saveTopic());

    expect(result.current.topic.permission).toBe("denied");
    expect(result.current.topic.dirtyFields).toEqual([]);
    expect(updateTopic).not.toHaveBeenCalled();
  });
});

describe("useTopicSummarySettings gates model", () => {
  it("loads gates only while open and does not infer permission from GET", async () => {
    const currentRuntime = runtime();
    const getSettings = vi.fn().mockResolvedValue(settings());
    const { result, rerender } = renderHook(
      ({ open }) =>
        useTopicSummarySettings({
          open,
          runtimeContext: currentRuntime,
          topic: topic(),
          getRuntimeContext: () => currentRuntime,
          client: { getSettings },
        }),
      { initialProps: { open: false } },
    );

    expect(getSettings).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));
    expect(result.current.gates.permission).toBe("unknown");

    rerender({ open: false });
    await waitFor(() => expect(result.current.gates.server).toBeNull());
    expect(result.current.gates.draft).toBeNull();
  });

  it("refetches, rebases dirty toggles and PUTs both booleans", async () => {
    const currentRuntime = runtime();
    const getSettings = vi
      .fn()
      .mockResolvedValueOnce(settings(true, true))
      .mockResolvedValueOnce(settings(false, true));
    const updateSettings = vi.fn().mockResolvedValue(settings(false, false));
    const { result } = renderHook(() =>
      useTopicSummarySettings({
        open: true,
        runtimeContext: currentRuntime,
        topic: topic(),
        getRuntimeContext: () => currentRuntime,
        client: { getSettings, updateSettings },
      }),
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    act(() => result.current.setProjectEnabled(false));
    act(() => result.current.saveGates());

    await waitFor(() => expect(result.current.gates.saveStatus).toBe("saved"));
    expect(updateSettings).toHaveBeenCalledWith(expect.any(Object), PROJECT_UUID, {
      global_enabled: false,
      project_enabled: false,
    });
    expect(result.current.gates.permission).toBe("allowed");
    expect(result.current.gates.dirty).toBe(false);
  });

  it("marks permission denied and rolls the draft back after PUT 403", async () => {
    const currentRuntime = runtime();
    const capabilitiesStore = useWorkspaceIamCapabilitiesStore.getState();
    const ownerKey = workspaceRuntimeOwnerKey(currentRuntime);
    capabilitiesStore.startLoad(ownerKey, currentRuntime.runtimeGeneration);
    const invalidationVersion = useWorkspaceIamCapabilitiesStore.getState().invalidationVersion;
    const getSettings = vi.fn().mockResolvedValue(settings());
    const updateSettings = vi.fn().mockRejectedValue(new MessengerApiError("denied", 403, null));
    const { result } = renderHook(() =>
      useTopicSummarySettings({
        open: true,
        runtimeContext: currentRuntime,
        topic: topic(),
        getRuntimeContext: () => currentRuntime,
        client: { getSettings, updateSettings },
      }),
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    act(() => result.current.setGlobalEnabled(false));
    act(() => result.current.saveGates());

    await waitFor(() => expect(result.current.gates.permission).toBe("denied"));
    expect(result.current.gates.error).toBe("forbidden");
    expect(result.current.gates.draft).toEqual({
      globalEnabled: true,
      projectEnabled: true,
    });
    expect(result.current.gates.dirty).toBe(false);
    expect(useWorkspaceIamCapabilitiesStore.getState().invalidationVersion).toBe(
      invalidationVersion + 1,
    );
  });

  it("preserves a dirty gates draft for retry after a network failure", async () => {
    const currentRuntime = runtime();
    const getSettings = vi.fn().mockResolvedValue(settings());
    const updateSettings = vi.fn().mockRejectedValue(new TypeError("network unavailable"));
    const { result } = renderHook(() =>
      useTopicSummarySettings({
        open: true,
        runtimeContext: currentRuntime,
        topic: topic(),
        getRuntimeContext: () => currentRuntime,
        client: { getSettings, updateSettings },
      }),
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    act(() => result.current.setProjectEnabled(false));
    act(() => result.current.saveGates());

    await waitFor(() => expect(result.current.gates.saveStatus).toBe("error"));
    expect(result.current.gates.error).toBe("network");
    expect(result.current.gates.draft?.projectEnabled).toBe(false);
    expect(result.current.gates.dirty).toBe(true);
    expect(result.current.gates.permission).toBe("unknown");
  });

  it("aborts on close and ignores a late gates response", async () => {
    const currentRuntime = runtime();
    const pending = deferred<WorkspaceTopicSummarySettingsDto>();
    const signals: AbortSignal[] = [];
    const getSettings = vi.fn().mockImplementation((options: { signal?: AbortSignal }) => {
      if (options.signal != null) signals.push(options.signal);
      return pending.promise;
    });
    const { result, rerender } = renderHook(
      ({ open }) =>
        useTopicSummarySettings({
          open,
          runtimeContext: currentRuntime,
          topic: topic(),
          getRuntimeContext: () => currentRuntime,
          client: { getSettings },
        }),
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("loading"));

    rerender({ open: false });
    expect(signals[0]?.aborted).toBe(true);
    pending.resolve(settings(false, false));
    await act(async () => {
      await pending.promise;
    });

    expect(result.current.gates.server).toBeNull();
    expect(result.current.gates.loadStatus).toBe("idle");
  });

  it("ignores a late response after the runtime generation changes", async () => {
    const firstRuntime = runtime(PROJECT_UUID, 1);
    const secondRuntime = runtime(PROJECT_UUID, 2);
    const getRuntimeContext = vi.fn(() => firstRuntime);
    const oldRequest = deferred<WorkspaceTopicSummarySettingsDto>();
    const getSettings = vi
      .fn()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce(settings(true, true));
    const { result, rerender } = renderHook(
      ({ activeRuntime }) =>
        useTopicSummarySettings({
          open: true,
          runtimeContext: activeRuntime,
          topic: topic(),
          getRuntimeContext,
          client: { getSettings },
        }),
      { initialProps: { activeRuntime: firstRuntime } },
    );
    await waitFor(() => expect(getSettings).toHaveBeenCalledOnce());

    getRuntimeContext.mockImplementation(() => secondRuntime);
    rerender({ activeRuntime: secondRuntime });
    await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.gates.loadStatus).toBe("ready"));

    oldRequest.resolve(settings(false, false));
    await act(async () => {
      await oldRequest.promise;
    });
    expect(result.current.gates.draft).toEqual({
      globalEnabled: true,
      projectEnabled: true,
    });
  });
});
