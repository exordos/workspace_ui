import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerTopicSummaryConfigurationRequestBody,
} from "~/shared/api/messenger.types";
import { adaptMessengerTopic } from "./messenger-adapters.lib";
import { updateMessengerTopicSummaryConfiguration } from "./messenger-topic-summary-actions.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerTopic } from "./messenger.types";

const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "44444444-4444-4444-8444-444444444444";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const DATE = "2026-08-21T10:00:00Z";
const LATER_DATE = "2026-08-21T10:01:00Z";

function runtimeContext(overrides: Partial<WorkspaceRuntimeContext> = {}): WorkspaceRuntimeContext {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "organization-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: PROJECT_A,
    userUuid: USER_A,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function topicDto(overrides: Partial<WorkspaceMessengerTopicDto> = {}): WorkspaceMessengerTopicDto {
  return {
    uuid: TOPIC_A,
    project_id: PROJECT_A,
    name: "Releases",
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    unread_count: 2,
    active_unread_count: 2,
    passive_unread_count: 0,
    is_default: false,
    is_done: false,
    notification_mode: "default",
    summary_enabled: true,
    summary_system_prompt: null,
    summary_reasoning_effort: null,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function prepareStore(context: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(context);
  useMessengerStore.getState().startBootstrap(ownerKey);
  useMessengerStore.getState().upsertTopic(ownerKey, adaptMessengerTopic(topicDto()));
  return ownerKey;
}

function setAuthRuntime(context: WorkspaceRuntimeContext): void {
  useWorkspaceAuthStore.setState({
    sessions: [
      {
        ...context,
        login: `${context.accountId}@example.com`,
        profile: {
          uuid: context.userUuid,
          username: context.accountId,
          firstName: null,
          lastName: null,
          email: null,
        },
      },
    ],
    currentAccountId: context.accountId,
    runtimeGeneration: context.runtimeGeneration,
  });
}

describe("updateMessengerTopicSummaryConfiguration", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
  });

  it("sends only the caller body and persists the applied topic", async () => {
    const context = runtimeContext();
    const ownerKey = prepareStore(context);
    const body: WorkspaceMessengerTopicSummaryConfigurationRequestBody = {
      summary_enabled: true,
      summary_system_prompt: "Summarize decisions",
      summary_reasoning_effort: "medium",
    };
    const setStreamTopicSummaryConfiguration = vi.fn(
      (
        _options: MessengerClientOptions,
        _topicUuid: string,
        _body: WorkspaceMessengerTopicSummaryConfigurationRequestBody,
      ) =>
        Promise.resolve(
          topicDto({
            summary_system_prompt: "Summarize decisions",
            summary_reasoning_effort: "medium",
            updated_at: LATER_DATE,
          }),
        ),
    );
    const upsertCachedTopic = vi.fn(() => Promise.resolve());

    const result = await updateMessengerTopicSummaryConfiguration({
      runtimeContext: context,
      getRuntimeContext: () => context,
      topicUuid: TOPIC_A,
      body,
      client: { setStreamTopicSummaryConfiguration },
      cache: { upsertCachedTopic },
    });

    expect(setStreamTopicSummaryConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      TOPIC_A,
      body,
    );
    expect(result).toEqual({
      status: "applied",
      ownerKey,
      source: "response",
      topic: expect.objectContaining({
        summarySystemPrompt: "Summarize decisions",
        summaryReasoningEffort: "medium",
      }),
    });
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toMatchObject({
      summarySystemPrompt: "Summarize decisions",
      updatedAt: LATER_DATE,
    });
    expect(upsertCachedTopic).toHaveBeenCalledWith(
      ownerKey,
      expect.objectContaining({ updatedAt: LATER_DATE }),
    );
  });

  it("skips a response after switching runtime owners", async () => {
    const context = runtimeContext();
    const ownerKey = prepareStore(context);
    const request = deferred<WorkspaceMessengerTopicDto>();
    let currentContext = context;
    const upsertCachedTopic = vi.fn(() => Promise.resolve());

    const resultPromise = updateMessengerTopicSummaryConfiguration({
      runtimeContext: context,
      getRuntimeContext: () => currentContext,
      topicUuid: TOPIC_A,
      body: { summary_enabled: false },
      client: { setStreamTopicSummaryConfiguration: vi.fn(() => request.promise) },
      cache: { upsertCachedTopic },
    });
    currentContext = runtimeContext({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "organization-b",
      projectId: PROJECT_B,
      userUuid: USER_B,
      runtimeGeneration: 2,
    });
    request.resolve(topicDto({ summary_enabled: false, updated_at: LATER_DATE }));

    await expect(resultPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.summaryEnabled).toBe(true);
    expect(upsertCachedTopic).not.toHaveBeenCalled();
  });

  it("uses the auth-store runtime by default and observes an owner switch", async () => {
    const context = runtimeContext();
    const ownerKey = prepareStore(context);
    setAuthRuntime(context);
    const request = deferred<WorkspaceMessengerTopicDto>();
    const upsertCachedTopic = vi.fn(() => Promise.resolve());

    const resultPromise = updateMessengerTopicSummaryConfiguration({
      runtimeContext: context,
      topicUuid: TOPIC_A,
      body: { summary_enabled: false },
      client: { setStreamTopicSummaryConfiguration: vi.fn(() => request.promise) },
      cache: { upsertCachedTopic },
    });
    setAuthRuntime(
      runtimeContext({
        accountId: "account-b",
        instanceId: "instance-b",
        organizationId: "organization-b",
        projectId: PROJECT_B,
        userUuid: USER_B,
        runtimeGeneration: 2,
      }),
    );
    request.resolve(topicDto({ summary_enabled: false, updated_at: LATER_DATE }));

    await expect(resultPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.summaryEnabled).toBe(true);
    expect(upsertCachedTopic).not.toHaveBeenCalled();
  });

  it("skips a response after the runtime generation changes", async () => {
    const context = runtimeContext();
    const ownerKey = prepareStore(context);
    const request = deferred<WorkspaceMessengerTopicDto>();
    let currentContext = context;
    const upsertCachedTopic = vi.fn(() => Promise.resolve());

    const resultPromise = updateMessengerTopicSummaryConfiguration({
      runtimeContext: context,
      getRuntimeContext: () => currentContext,
      topicUuid: TOPIC_A,
      body: { summary_reasoning_effort: "high" },
      client: { setStreamTopicSummaryConfiguration: vi.fn(() => request.promise) },
      cache: { upsertCachedTopic },
    });
    currentContext = { ...context, runtimeGeneration: 2 };
    request.resolve(topicDto({ summary_reasoning_effort: "high", updated_at: LATER_DATE }));

    await expect(resultPromise).resolves.toEqual({
      status: "skipped",
      ownerKey,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().topicsById[TOPIC_A]?.summaryReasoningEffort).toBeNull();
    expect(upsertCachedTopic).not.toHaveBeenCalled();
  });

  it("keeps and returns a newer realtime topic when the HTTP response arrives late", async () => {
    const context = runtimeContext();
    const ownerKey = prepareStore(context);
    const request = deferred<WorkspaceMessengerTopicDto>();
    const upsertCachedTopic = vi.fn(() => Promise.resolve());
    const newerRealtimeTopic = adaptMessengerTopic(
      topicDto({
        summary_enabled: false,
        summary_system_prompt: "Newer realtime prompt",
        updated_at: "2026-08-21T10:02:00Z",
      }),
    );

    const resultPromise = updateMessengerTopicSummaryConfiguration({
      runtimeContext: context,
      getRuntimeContext: () => context,
      topicUuid: TOPIC_A,
      body: { summary_system_prompt: "Late response prompt" },
      client: { setStreamTopicSummaryConfiguration: vi.fn(() => request.promise) },
      cache: { upsertCachedTopic },
    });
    useMessengerStore.getState().upsertTopic(ownerKey, newerRealtimeTopic);
    request.resolve(
      topicDto({
        summary_system_prompt: "Late response prompt",
        updated_at: LATER_DATE,
      }),
    );

    await expect(resultPromise).resolves.toEqual({
      status: "applied",
      ownerKey,
      source: "current",
      topic: newerRealtimeTopic,
    });
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toBe(newerRealtimeTopic);
    expect(upsertCachedTopic).toHaveBeenCalledWith(ownerKey, newerRealtimeTopic);
  });

  it("returns a newer realtime topic that arrives during the cache write", async () => {
    const context = runtimeContext();
    const ownerKey = prepareStore(context);
    const cacheWrite = deferred<void>();
    const upsertCachedTopic = vi.fn(() => cacheWrite.promise);
    const newerRealtimeTopic = adaptMessengerTopic(
      topicDto({
        summary_enabled: false,
        summary_system_prompt: "Realtime prompt during cache write",
        updated_at: "2026-08-21T10:02:00Z",
      }),
    );

    const resultPromise = updateMessengerTopicSummaryConfiguration({
      runtimeContext: context,
      getRuntimeContext: () => context,
      topicUuid: TOPIC_A,
      body: { summary_system_prompt: "HTTP response prompt" },
      client: {
        setStreamTopicSummaryConfiguration: vi.fn(() =>
          Promise.resolve(
            topicDto({
              summary_system_prompt: "HTTP response prompt",
              updated_at: LATER_DATE,
            }),
          ),
        ),
      },
      cache: { upsertCachedTopic },
    });

    await vi.waitFor(() => expect(upsertCachedTopic).toHaveBeenCalledOnce());
    useMessengerStore.getState().upsertTopic(ownerKey, newerRealtimeTopic);
    cacheWrite.resolve();

    await expect(resultPromise).resolves.toEqual({
      status: "applied",
      ownerKey,
      source: "current",
      topic: newerRealtimeTopic,
    });
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toBe(newerRealtimeTopic);
  });

  it("keeps the applied result when the durable cache write fails", async () => {
    const context = runtimeContext();
    const ownerKey = prepareStore(context);
    const cacheError = new Error("cache unavailable");

    await expect(
      updateMessengerTopicSummaryConfiguration({
        runtimeContext: context,
        getRuntimeContext: () => context,
        topicUuid: TOPIC_A,
        body: { summary_enabled: false },
        client: {
          setStreamTopicSummaryConfiguration: vi.fn(() =>
            Promise.resolve(topicDto({ summary_enabled: false, updated_at: LATER_DATE })),
          ),
        },
        cache: { upsertCachedTopic: vi.fn(() => Promise.reject(cacheError)) },
      }),
    ).resolves.toEqual({
      status: "applied",
      ownerKey,
      source: "response",
      topic: expect.objectContaining({ summaryEnabled: false }),
    });
  });

  it("rethrows an ordinary API failure without changing store or cache", async () => {
    const context = runtimeContext();
    prepareStore(context);
    const topicBeforeRequest = useMessengerStore.getState().topicsById[TOPIC_A] as MessengerTopic;
    const apiError = Object.assign(new Error("forbidden"), { status: 403 });
    const upsertCachedTopic = vi.fn(() => Promise.resolve());

    await expect(
      updateMessengerTopicSummaryConfiguration({
        runtimeContext: context,
        getRuntimeContext: () => context,
        topicUuid: TOPIC_A,
        body: { summary_enabled: false },
        client: {
          setStreamTopicSummaryConfiguration: vi.fn(() => Promise.reject(apiError)),
        },
        cache: { upsertCachedTopic },
      }),
    ).rejects.toBe(apiError);
    expect(useMessengerStore.getState().topicsById[TOPIC_A]).toBe(topicBeforeRequest);
    expect(upsertCachedTopic).not.toHaveBeenCalled();
  });
});
