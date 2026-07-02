import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type { WorkspaceMessengerStreamBindingDto } from "~/shared/api/messenger.types";
import {
  clearMessengerStreamBindingsLoadRegistry,
  loadMessengerStreamBindings,
  streamUuidFromWorkspaceMessengerRoute,
} from "./messenger-stream-bindings-loader.lib";
import { useMessengerStore } from "./messenger.model";

const ACCOUNT_A = "account-a";
const ACCOUNT_B = "account-b";
const INSTANCE_A = "instance-a";
const INSTANCE_B = "instance-b";
const ORGANIZATION_A = "organization-a";
const ORGANIZATION_B = "organization-b";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "44444444-4444-4444-8444-444444444444";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "37a28696-153d-431e-a5fb-36f0c0209765";
const BINDING_A = "dff7201e-5120-422d-ac5a-3cbe596dd71b";
const BINDING_B = "3ba0d6e2-b7cd-4e70-90f8-89b202f8d1e7";
const DATE = "2026-06-22T10:10:00Z";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    organizationOrigin: "https://org-a.example.com",
    projectId: PROJECT_A,
    userUuid: USER_A,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createStreamBindingDto(
  overrides: Partial<WorkspaceMessengerStreamBindingDto> = {},
): WorkspaceMessengerStreamBindingDto {
  return {
    uuid: BINDING_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    who_uuid: USER_A,
    role: "member",
    notification_mode: "all_messages",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function prepareStoreOwner(runtimeContext: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const store = useMessengerStore.getState();
  store.startBootstrap(ownerKey);
  useMessengerStore.getState().replaceBootstrapState(ownerKey, {
    streams: [],
    streamBindings: [],
    topics: [],
    conversations: [],
    folders: [],
    users: [],
  });
  return ownerKey;
}

describe("messenger stream bindings loader", () => {
  beforeEach(() => {
    clearMessengerStreamBindingsLoadRegistry();
    useMessengerStore.getState().clear();
  });

  it("loads stream bindings through Workspace API and writes adapted bindings to the messenger store", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getStreamBindings = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve([
        createStreamBindingDto(),
        createStreamBindingDto({
          uuid: BINDING_B,
          user_uuid: USER_B,
          who_uuid: USER_B,
          role: "administrator",
        }),
      ]),
    );
    const upsertStreamBindings = vi.fn();

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindings },
        cache: { upsertStreamBindings },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 2,
    });

    expect(getStreamBindings).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      { streamUuid: STREAM_A },
    );
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([
      BINDING_A,
      BINDING_B,
    ]);
    expect(useMessengerStore.getState().streamBindingsById[BINDING_B]).toMatchObject({
      uuid: BINDING_B,
      streamUuid: STREAM_A,
      userUuid: USER_B,
      role: "administrator",
    });
    expect(upsertStreamBindings).toHaveBeenCalledWith(
      ownerKey,
      expect.arrayContaining([expect.objectContaining({ uuid: BINDING_A })]),
    );
  });

  it("skips the request when bindings for this stream are already in store", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    useMessengerStore.getState().upsertStreamBindings(ownerKey, [
      {
        uuid: BINDING_A,
        projectId: PROJECT_A,
        streamUuid: STREAM_A,
        userUuid: USER_A,
        whoUuid: USER_A,
        role: "member",
        notificationMode: "all_messages",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    const getStreamBindings = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve([createStreamBindingDto()]),
    );

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindings },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey,
      streamUuid: STREAM_A,
      reason: "already-loaded",
    });

    expect(getStreamBindings).not.toHaveBeenCalled();
  });

  it("refetches after an empty backend response because the store has no binding ids", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getStreamBindings = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve([]),
    );

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindings },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 0,
    });
    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindings },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 0,
    });

    expect(getStreamBindings).toHaveBeenCalledTimes(2);
  });

  it("refetches after the store is wiped instead of trusting the old loaded registry", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getStreamBindings = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve([createStreamBindingDto()]),
    );

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindings },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });

    useMessengerStore.getState().clear();
    prepareStoreOwner(runtimeContext);

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindings },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });

    expect(getStreamBindings).toHaveBeenCalledTimes(2);
  });

  it("does not apply an old response after runtime owner changes", async () => {
    let currentContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(currentContext);
    const bindingsRequest = createDeferred<WorkspaceMessengerStreamBindingDto[]>();
    const loading = loadMessengerStreamBindings({
      runtimeContext: currentContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => currentContext,
      client: { getStreamBindings: () => bindingsRequest.promise },
      cache: { upsertStreamBindings: vi.fn() },
    });

    currentContext = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 2,
    });
    bindingsRequest.resolve([createStreamBindingDto()]);

    await expect(loading).resolves.toEqual({
      status: "skipped",
      ownerKey,
      streamUuid: STREAM_A,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toBeUndefined();
  });

  it("deduplicates parallel loads for the same runtime stream", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const bindingsRequest = createDeferred<WorkspaceMessengerStreamBindingDto[]>();
    const getStreamBindings = vi.fn(
      (_options: MessengerClientOptions, _query: unknown) => bindingsRequest.promise,
    );

    const firstLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindings },
      cache: { upsertStreamBindings: vi.fn() },
    });
    const secondLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindings },
      cache: { upsertStreamBindings: vi.fn() },
    });

    bindingsRequest.resolve([createStreamBindingDto()]);

    await expect(firstLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    await expect(secondLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    expect(getStreamBindings).toHaveBeenCalledTimes(1);
  });

  it("extracts stream uuid only from stream and topic routes", () => {
    expect(
      streamUuidFromWorkspaceMessengerRoute({
        kind: "stream",
        orgId: "org-a",
        projectId: PROJECT_A,
        streamUuid: STREAM_A,
      }),
    ).toBe(STREAM_A);
    expect(
      streamUuidFromWorkspaceMessengerRoute({
        kind: "topic",
        orgId: "org-a",
        projectId: PROJECT_A,
        streamUuid: STREAM_B,
        topicUuid: "topic-a",
      }),
    ).toBe(STREAM_B);
    expect(
      streamUuidFromWorkspaceMessengerRoute({
        kind: "message",
        orgId: "org-a",
        projectId: PROJECT_A,
        messageUuid: "message-a",
      }),
    ).toBeNull();
  });
});
